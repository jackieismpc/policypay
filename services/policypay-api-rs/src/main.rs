mod chain_client;
mod domain;

use std::{
    env, fs,
    net::SocketAddr,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};

use anyhow::anyhow;
use axum::{
    extract::{Path as AxumPath, Query, State},
    http::{HeaderMap, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{sqlite::SqliteConnectOptions, Row, SqlitePool};
use tracing::{error, info};
use uuid::Uuid;

use crate::chain_client::{
    AddBatchItemInput, ApproveBatchInput, ApproveIntentInput, BatchActionInput, ChainClient,
    CreateBatchInput, CreateIntentInput, CreatePolicyInput, IntentActionInput,
};
use crate::domain::{domain_contract, is_valid_execution_status, is_valid_timeline_source};

const DASHBOARD_HTML: &str = include_str!("../../../app/static/dashboard.html");

#[derive(Clone)]
struct AppState {
    pool: SqlitePool,
    chain: ChainClient,
    api_key: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PolicyOnlyInput {
    policy: String,
}

#[derive(Debug, Deserialize)]
struct CreateIntentMinimalInput {
    policy: String,
    recipient: String,
    amount: u64,
    memo: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApproveOnlyInput {
    policy: String,
    #[serde(rename = "approvalDigest")]
    approval_digest: Option<Vec<u8>>,
}

#[derive(Debug, Deserialize)]
struct ExecutionTask {
    policy: String,
    #[serde(rename = "intentId")]
    intent_id: i64,
    #[serde(rename = "paymentIntent")]
    payment_intent: String,
    #[serde(rename = "shouldFail")]
    should_fail: Option<bool>,
    #[serde(rename = "failureReason")]
    failure_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BatchExecutionInput {
    mode: Option<String>,
    items: Vec<ExecutionTask>,
}

#[derive(Debug, Deserialize)]
struct TimelineWriteInput {
    #[serde(rename = "intentId")]
    intent_id: i64,
    status: String,
    details: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct ExecutionListQuery {
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TimelineListQuery {
    #[serde(rename = "intentId")]
    intent_id: Option<i64>,
    source: Option<String>,
}

#[derive(Debug, Serialize)]
struct AuditLogRecord {
    id: String,
    action: String,
    status: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    details: Value,
}

#[derive(Debug, Serialize, Clone)]
struct RelayerRecord {
    #[serde(rename = "intentId")]
    intent_id: i64,
    #[serde(rename = "paymentIntent")]
    payment_intent: String,
    status: String,
    signature: Option<String>,
    #[serde(rename = "failureReason")]
    failure_reason: Option<String>,
    #[serde(rename = "updatedAt")]
    updated_at: String,
}

#[derive(Debug, Serialize)]
struct TimelineRecord {
    #[serde(rename = "intentId")]
    intent_id: i64,
    status: String,
    source: String,
    #[serde(rename = "observedAt")]
    observed_at: String,
    details: Value,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            env::var("RUST_LOG").unwrap_or_else(|_| "policypay_api_rs=info,info".to_string()),
        )
        .init();

    let port = env::var("POLICYPAY_RS_API_PORT")
        .ok()
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(24100);

    let sqlite_path =
        env::var("POLICYPAY_SQLITE_PATH").unwrap_or_else(|_| "./data/policypay.sqlite".to_string());

    let rpc_url = env::var("POLICYPAY_RPC_URL")
        .or_else(|_| env::var("SOLANA_RPC_URL"))
        .unwrap_or_else(|_| "http://127.0.0.1:8899".to_string());

    let wallet_path = env::var("POLICYPAY_WALLET_PATH")
        .or_else(|_| env::var("ANCHOR_WALLET"))
        .unwrap_or_else(|_| "./wallets/localnet.json".to_string());

    let program_id = env::var("POLICY_PAY_PROGRAM_ID").ok();

    let api_key = env::var("POLICYPAY_API_KEY")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    ensure_parent_dir(&sqlite_path)?;

    let connect_options = SqliteConnectOptions::new()
        .filename(&sqlite_path)
        .create_if_missing(true);
    let pool = SqlitePool::connect_with(connect_options).await?;
    init_db(&pool).await?;

    let chain = ChainClient::new(&rpc_url, &wallet_path, program_id.as_deref())?;

    let state = AppState {
        pool,
        chain,
        api_key,
    };

    let api_router = Router::new()
        .route("/openapi.json", get(openapi_spec))
        .route("/summary", get(get_summary))
        .route("/audit-logs", get(get_audit_logs))
        .route("/domain/contract", get(get_domain_contract))
        .route("/policies", post(create_policy))
        .route("/policies/:mint", get(get_policy_by_mint))
        .route(
            "/policies/:policy/intents/:intent_id",
            get(get_policy_intent),
        )
        .route("/policies/:policy/batches/:batch_id", get(get_policy_batch))
        .route("/intents", post(create_intent))
        .route("/intents/minimal", post(create_intent_minimal))
        .route("/intents/draft", post(create_draft_intent))
        .route("/intents/:intent_id/submit", post(submit_draft_intent))
        .route("/intents/:intent_id/approve", post(approve_intent))
        .route("/intents/:intent_id/cancel", post(cancel_intent))
        .route("/intents/:intent_id/retry", post(retry_intent))
        .route("/batches", post(create_batch_intent_onchain))
        .route("/batches/:batch_id/items", post(add_batch_item_onchain))
        .route(
            "/batches/:batch_id/submit",
            post(submit_batch_for_approval_onchain),
        )
        .route(
            "/batches/:batch_id/approve",
            post(approve_batch_intent_onchain),
        )
        .route(
            "/batches/:batch_id/cancel",
            post(cancel_batch_intent_onchain),
        )
        .route("/executions", get(list_executions).post(create_execution))
        .route("/executions/batch", post(create_executions_batch))
        .route("/executions/:intent_id", get(get_execution_by_intent))
        .route("/executions/:intent_id/confirm", post(confirm_execution))
        .route("/timeline", get(list_timeline))
        .route("/timeline/chain", post(write_timeline_chain))
        .route("/timeline/relayer", post(write_timeline_relayer));

    let app = Router::new()
        .route("/", get(dashboard_page))
        .route("/health", get(health))
        .route("/openapi.json", get(openapi_spec))
        .nest("/api/v1", api_router)
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    info!("policypay-api-rs listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn dashboard_page() -> Html<&'static str> {
    Html(DASHBOARD_HTML)
}

fn ensure_parent_dir(path: &str) -> anyhow::Result<()> {
    if let Some(parent) = Path::new(path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    Ok(())
}

async fn init_db(pool: &SqlitePool) -> anyhow::Result<()> {
    sqlx::query("PRAGMA journal_mode = WAL;")
        .execute(pool)
        .await?;
    sqlx::query("PRAGMA busy_timeout = 5000;")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS idempotency_records (
            action TEXT NOT NULL,
            idem_key TEXT NOT NULL,
            request_hash TEXT NOT NULL,
            status_code INTEGER NOT NULL,
            response_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY(action, idem_key)
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS control_plane_audit_logs (
            id TEXT PRIMARY KEY,
            action TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            details_json TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS relayer_executions (
            intent_id INTEGER PRIMARY KEY,
            payment_intent TEXT NOT NULL,
            status TEXT NOT NULL,
            signature TEXT,
            failure_reason TEXT,
            updated_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS indexer_timeline (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            intent_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            source TEXT NOT NULL,
            observed_at TEXT NOT NULL,
            details_json TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}

fn json_error(status: StatusCode, message: impl Into<String>) -> Response {
    (status, Json(json!({ "error": message.into() }))).into_response()
}

fn read_api_key(headers: &HeaderMap) -> Option<String> {
    if let Some(value) = headers
        .get("x-api-key")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        return Some(value.to_string());
    }

    headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn ensure_write_auth(state: &AppState, headers: &HeaderMap) -> Option<Response> {
    let Some(expected_key) = &state.api_key else {
        return None;
    };

    let Some(provided_key) = read_api_key(headers) else {
        return Some(json_error(
            StatusCode::UNAUTHORIZED,
            "missing api key (x-api-key or Authorization: Bearer ...)",
        ));
    };

    if &provided_key == expected_key {
        None
    } else {
        Some(json_error(StatusCode::UNAUTHORIZED, "invalid api key"))
    }
}

fn idempotency_key(headers: &HeaderMap) -> Option<String> {
    headers
        .get("Idempotency-Key")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(ToString::to_string)
}

fn request_hash(method: &str, path: &str, body: &Value) -> String {
    let mut hasher = Sha256::new();
    hasher.update(method.as_bytes());
    hasher.update(b"|");
    hasher.update(path.as_bytes());
    hasher.update(b"|");
    hasher.update(body.to_string().as_bytes());
    hex::encode(hasher.finalize())
}

async fn append_audit(
    state: &AppState,
    action: &str,
    status: &str,
    details: &Value,
) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO control_plane_audit_logs (
            id, action, status, created_at, details_json
        ) VALUES (?, ?, ?, ?, ?)
        "#,
    )
    .bind(format!(
        "{}-{}",
        Uuid::new_v4(),
        Utc::now().timestamp_millis()
    ))
    .bind(action)
    .bind(status)
    .bind(Utc::now().to_rfc3339())
    .bind(details.to_string())
    .execute(&state.pool)
    .await?;

    Ok(())
}

async fn get_idempotent_cached(
    state: &AppState,
    action: &str,
    key: &str,
) -> anyhow::Result<Option<(String, i64, Value)>> {
    let row = sqlx::query(
        r#"
        SELECT request_hash, status_code, response_json
        FROM idempotency_records
        WHERE action = ? AND idem_key = ?
        "#,
    )
    .bind(action)
    .bind(key)
    .fetch_optional(&state.pool)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };

    let req_hash: String = row.try_get("request_hash")?;
    let status_code: i64 = row.try_get("status_code")?;
    let response_json: String = row.try_get("response_json")?;
    let parsed = serde_json::from_str::<Value>(&response_json)?;

    Ok(Some((req_hash, status_code, parsed)))
}

async fn put_idempotent_cached(
    state: &AppState,
    action: &str,
    key: &str,
    req_hash: &str,
    status_code: StatusCode,
    response: &Value,
) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO idempotency_records (
            action, idem_key, request_hash, status_code, response_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(action, idem_key) DO UPDATE SET
            request_hash = excluded.request_hash,
            status_code = excluded.status_code,
            response_json = excluded.response_json,
            created_at = excluded.created_at
        "#,
    )
    .bind(action)
    .bind(key)
    .bind(req_hash)
    .bind(i64::from(status_code.as_u16()))
    .bind(response.to_string())
    .bind(Utc::now().to_rfc3339())
    .execute(&state.pool)
    .await?;

    Ok(())
}

async fn onchain_read<F>(state: AppState, operation: F) -> Response
where
    F: FnOnce(ChainClient) -> anyhow::Result<Value> + Send + 'static,
{
    let chain = state.chain.clone();

    match tokio::task::spawn_blocking(move || operation(chain)).await {
        Ok(Ok(value)) => (StatusCode::OK, Json(value)).into_response(),
        Ok(Err(error)) => json_error(StatusCode::BAD_REQUEST, error.to_string()),
        Err(error) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("join on read task failed: {error}"),
        ),
    }
}

async fn onchain_write_with_audit_and_idempotency<F>(
    state: AppState,
    headers: HeaderMap,
    action: &'static str,
    path: String,
    body: Value,
    operation: F,
) -> Response
where
    F: FnOnce(ChainClient, Value) -> anyhow::Result<(StatusCode, Value)> + Send + 'static,
{
    if let Some(response) = ensure_write_auth(&state, &headers) {
        return response;
    }

    if let Err(error) = append_audit(&state, action, "requested", &body).await {
        error!("append requested audit failed: {}", error);
    }

    let idem_key = idempotency_key(&headers);
    let req_hash = request_hash("POST", &path, &body);

    if let Some(key) = &idem_key {
        match get_idempotent_cached(&state, action, key).await {
            Ok(Some((cached_hash, cached_status, cached_body))) => {
                if cached_hash != req_hash {
                    return json_error(
                        StatusCode::CONFLICT,
                        "idempotency key conflict: request payload mismatch",
                    );
                }

                let status =
                    StatusCode::from_u16(cached_status as u16).unwrap_or(StatusCode::BAD_REQUEST);
                return (status, Json(cached_body)).into_response();
            }
            Ok(None) => {}
            Err(error) => {
                return json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("idempotency read failed: {error}"),
                )
            }
        }
    }

    let chain = state.chain.clone();
    let task_body = body.clone();

    match tokio::task::spawn_blocking(move || operation(chain, task_body)).await {
        Ok(Ok((status, resp_body))) => {
            let audit_status = if status.is_success() {
                "succeeded"
            } else {
                "failed"
            };

            if let Err(error) = append_audit(&state, action, audit_status, &resp_body).await {
                error!("append completion audit failed: {}", error);
            }

            if let Some(key) = &idem_key {
                if let Err(error) =
                    put_idempotent_cached(&state, action, key, &req_hash, status, &resp_body).await
                {
                    error!("idempotency cache write failed: {}", error);
                }
            }

            (status, Json(resp_body)).into_response()
        }
        Ok(Err(error)) => {
            let details = json!({ "error": error.to_string() });
            if let Err(log_error) = append_audit(&state, action, "failed", &details).await {
                error!("append failure audit failed: {}", log_error);
            }

            json_error(StatusCode::BAD_REQUEST, error.to_string())
        }
        Err(error) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("join on write task failed: {error}"),
        ),
    }
}

fn parse_approval_digest(input: Option<Vec<u8>>) -> anyhow::Result<[u8; 32]> {
    let bytes = input.unwrap_or_else(|| vec![0_u8; 32]);
    if bytes.len() != 32 {
        return Err(anyhow!("approvalDigest must be an array of 32 bytes"));
    }

    let mut digest = [0_u8; 32];
    digest.copy_from_slice(&bytes);
    Ok(digest)
}

async fn health(State(state): State<AppState>) -> impl IntoResponse {
    let chain = state.chain.clone();
    let chain_healthy = tokio::task::spawn_blocking(move || chain.ping())
        .await
        .ok()
        .and_then(Result::ok)
        .is_some();

    Json(json!({
        "ok": true,
        "runtime": "tokio+axum",
        "chain": {
            "programId": state.chain.program_id().to_string(),
            "authority": state.chain.authority().to_string(),
            "healthy": chain_healthy
        },
        "storage": {
            "driver": "sqlite"
        },
        "auth": {
            "apiKeyEnabled": state.api_key.is_some()
        }
    }))
}

async fn openapi_spec() -> impl IntoResponse {
    Json(json!({
        "openapi": "3.0.3",
        "info": {
            "title": "PolicyPay Unified API",
            "version": "1.0.0",
            "description": "Rust (tokio + axum) unified entry for policy/intent/batch workflows"
        },
        "servers": [{ "url": "/api/v1", "description": "Versioned" }],
        "components": {
            "securitySchemes": {
                "ApiKeyHeader": {
                    "type": "apiKey",
                    "in": "header",
                    "name": "x-api-key"
                },
                "BearerAuth": {
                    "type": "http",
                    "scheme": "bearer"
                }
            }
        },
        "paths": {
            "/health": { "get": { "summary": "Health check" } },
            "/intents": { "post": { "summary": "Create intent" } },
            "/intents/minimal": { "post": { "summary": "Create intent with business-minimal fields (auto-generates intentId/reference)" } },
            "/intents/draft": { "post": { "summary": "Create draft intent" } },
            "/intents/{intentId}/submit": { "post": { "summary": "Submit draft intent" } },
            "/intents/{intentId}/approve": { "post": { "summary": "Approve intent" } },
            "/intents/{intentId}/cancel": { "post": { "summary": "Cancel intent" } },
            "/intents/{intentId}/retry": { "post": { "summary": "Retry intent" } },
            "/batches": { "post": { "summary": "Create batch intent" } },
            "/batches/{batchId}/items": { "post": { "summary": "Add batch item" } },
            "/batches/{batchId}/submit": { "post": { "summary": "Submit batch for approval" } },
            "/batches/{batchId}/approve": { "post": { "summary": "Approve batch intent" } },
            "/batches/{batchId}/cancel": { "post": { "summary": "Cancel batch intent" } },
            "/audit-logs": { "get": { "summary": "List audit logs" } },
            "/domain/contract": { "get": { "summary": "Domain contract (statuses, events, error codes)" } },
            "/executions": { "get": { "summary": "List executions" }, "post": { "summary": "Create simulated execution" } },
            "/timeline": { "get": { "summary": "List timeline" } }
        }
    }))
}

async fn get_domain_contract() -> impl IntoResponse {
    Json(domain_contract().clone())
}

async fn get_audit_logs(State(state): State<AppState>) -> impl IntoResponse {
    let rows = sqlx::query(
        r#"
        SELECT id, action, status, created_at, details_json
        FROM control_plane_audit_logs
        ORDER BY created_at DESC, rowid DESC
        LIMIT 200
        "#,
    )
    .fetch_all(&state.pool)
    .await;

    match rows {
        Ok(rows) => {
            let items: Vec<AuditLogRecord> = rows
                .into_iter()
                .map(|row| AuditLogRecord {
                    id: row.try_get("id").unwrap_or_default(),
                    action: row.try_get("action").unwrap_or_default(),
                    status: row.try_get("status").unwrap_or_default(),
                    created_at: row.try_get("created_at").unwrap_or_default(),
                    details: row
                        .try_get::<String, _>("details_json")
                        .ok()
                        .and_then(|v| serde_json::from_str::<Value>(&v).ok())
                        .unwrap_or_else(|| json!({})),
                })
                .collect();

            (StatusCode::OK, Json(json!({ "items": items }))).into_response()
        }
        Err(error) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("list audit logs failed: {error}"),
        ),
    }
}

async fn get_policy_by_mint(
    State(state): State<AppState>,
    AxumPath(mint): AxumPath<String>,
) -> Response {
    onchain_read(state, move |chain| chain.fetch_policy_by_mint(&mint)).await
}

async fn get_policy_intent(
    State(state): State<AppState>,
    AxumPath((policy, intent_id)): AxumPath<(String, u64)>,
) -> Response {
    onchain_read(state, move |chain| chain.fetch_intent(&policy, intent_id)).await
}

async fn get_policy_batch(
    State(state): State<AppState>,
    AxumPath((policy, batch_id)): AxumPath<(String, u64)>,
) -> Response {
    onchain_read(state, move |chain| chain.fetch_batch(&policy, batch_id)).await
}

async fn create_policy(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Response {
    onchain_write_with_audit_and_idempotency(
        state,
        headers,
        "create_policy",
        "/policies".to_string(),
        payload,
        move |chain, body| {
            let input: CreatePolicyInput = serde_json::from_value(body)
                .map_err(|e| anyhow!("invalid create policy payload: {e}"))?;
            let value = chain.create_policy(input)?;
            Ok((StatusCode::CREATED, value))
        },
    )
    .await
}

async fn create_intent(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Response {
    onchain_write_with_audit_and_idempotency(
        state,
        headers,
        "create_intent",
        "/intents".to_string(),
        payload,
        move |chain, body| {
            let input: CreateIntentInput = serde_json::from_value(body)
                .map_err(|e| anyhow!("invalid create intent payload: {e}"))?;
            let value = chain.create_intent(input)?;
            Ok((StatusCode::CREATED, value))
        },
    )
    .await
}

fn generate_intent_id() -> u64 {
    static INTENT_NONCE: AtomicU64 = AtomicU64::new(0);
    let now_ms = Utc::now().timestamp_millis();
    let base = if now_ms < 0 { 0_u64 } else { now_ms as u64 };
    let nonce = INTENT_NONCE.fetch_add(1, Ordering::Relaxed) & 0xFFFF;
    (base << 16) | nonce
}

fn generate_reference(intent_id: u64) -> String {
    format!("auto-{intent_id}")
}

async fn create_intent_minimal(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Response {
    onchain_write_with_audit_and_idempotency(
        state,
        headers,
        "create_intent_minimal",
        "/intents/minimal".to_string(),
        payload,
        move |chain, body| {
            let input: CreateIntentMinimalInput = serde_json::from_value(body)
                .map_err(|e| anyhow!("invalid create intent minimal payload: {e}"))?;

            if input.amount == 0 {
                return Err(anyhow!("amount must be a positive integer"));
            }

            let intent_id = generate_intent_id();
            let memo = input.memo.unwrap_or_default();
            let reference = generate_reference(intent_id);

            let value = chain.create_intent(CreateIntentInput {
                policy: input.policy,
                intent_id,
                recipient: input.recipient,
                amount: input.amount,
                memo: Some(memo.clone()),
                reference: Some(reference.clone()),
            })?;

            let response = json!({
                "intentId": intent_id,
                "reference": reference,
                "memo": memo,
                "signature": value.get("signature"),
                "paymentIntent": value.get("paymentIntent")
            });

            Ok((StatusCode::CREATED, response))
        },
    )
    .await
}

async fn create_draft_intent(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Response {
    onchain_write_with_audit_and_idempotency(
        state,
        headers,
        "create_draft_intent",
        "/intents/draft".to_string(),
        payload,
        move |chain, body| {
            let input: CreateIntentInput = serde_json::from_value(body)
                .map_err(|e| anyhow!("invalid create draft intent payload: {e}"))?;
            let value = chain.create_draft_intent(input)?;
            Ok((StatusCode::CREATED, value))
        },
    )
    .await
}

async fn submit_draft_intent(
    State(state): State<AppState>,
    headers: HeaderMap,
    AxumPath(intent_id): AxumPath<u64>,
    Json(payload): Json<Value>,
) -> Response {
    onchain_write_with_audit_and_idempotency(
        state,
        headers,
        "submit_draft_intent",
        format!("/intents/{intent_id}/submit"),
        payload,
        move |chain, body| {
            let input: PolicyOnlyInput = serde_json::from_value(body)
                .map_err(|e| anyhow!("invalid submit draft payload: {e}"))?;
            let value = chain.submit_draft_intent(IntentActionInput {
                policy: input.policy,
                intent_id,
            })?;
            Ok((StatusCode::OK, value))
        },
    )
    .await
}

async fn approve_intent(
    State(state): State<AppState>,
    headers: HeaderMap,
    AxumPath(intent_id): AxumPath<u64>,
    Json(payload): Json<Value>,
) -> Response {
    onchain_write_with_audit_and_idempotency(
        state,
        headers,
        "approve_intent",
        format!("/intents/{intent_id}/approve"),
        payload,
        move |chain, body| {
            let input: ApproveOnlyInput = serde_json::from_value(body)
                .map_err(|e| anyhow!("invalid approve intent payload: {e}"))?;

            let value = chain.approve_intent(ApproveIntentInput {
                policy: input.policy,
                intent_id,
                approval_digest: parse_approval_digest(input.approval_digest)?,
            })?;

            Ok((StatusCode::OK, value))
        },
    )
    .await
}

async fn cancel_intent(
    State(state): State<AppState>,
    headers: HeaderMap,
    AxumPath(intent_id): AxumPath<u64>,
    Json(payload): Json<Value>,
) -> Response {
    onchain_write_with_audit_and_idempotency(
        state,
        headers,
        "cancel_intent",
        format!("/intents/{intent_id}/cancel"),
        payload,
        move |chain, body| {
            let input: PolicyOnlyInput = serde_json::from_value(body)
                .map_err(|e| anyhow!("invalid cancel intent payload: {e}"))?;
            let value = chain.cancel_intent(IntentActionInput {
                policy: input.policy,
                intent_id,
            })?;
            Ok((StatusCode::OK, value))
        },
    )
    .await
}

async fn retry_intent(
    State(state): State<AppState>,
    headers: HeaderMap,
    AxumPath(intent_id): AxumPath<u64>,
    Json(payload): Json<Value>,
) -> Response {
    onchain_write_with_audit_and_idempotency(
        state,
        headers,
        "retry_intent",
        format!("/intents/{intent_id}/retry"),
        payload,
        move |chain, body| {
            let input: PolicyOnlyInput = serde_json::from_value(body)
                .map_err(|e| anyhow!("invalid retry intent payload: {e}"))?;
            let value = chain.retry_intent(IntentActionInput {
                policy: input.policy,
                intent_id,
            })?;
            Ok((StatusCode::OK, value))
        },
    )
    .await
}

async fn create_batch_intent_onchain(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Response {
    onchain_write_with_audit_and_idempotency(
        state,
        headers,
        "create_batch_intent_onchain",
        "/batches".to_string(),
        payload,
        move |chain, body| {
            let input: CreateBatchInput = serde_json::from_value(body)
                .map_err(|e| anyhow!("invalid create batch payload: {e}"))?;
            let value = chain.create_batch_intent(input)?;
            Ok((StatusCode::CREATED, value))
        },
    )
    .await
}

async fn add_batch_item_onchain(
    State(state): State<AppState>,
    headers: HeaderMap,
    AxumPath(batch_id): AxumPath<u64>,
    Json(payload): Json<Value>,
) -> Response {
    onchain_write_with_audit_and_idempotency(
        state,
        headers,
        "add_batch_item_onchain",
        format!("/batches/{batch_id}/items"),
        payload,
        move |chain, body| {
            let input: AddBatchItemInput = serde_json::from_value(body)
                .map_err(|e| anyhow!("invalid add batch item payload: {e}"))?;
            let value = chain.add_batch_item(AddBatchItemInput { batch_id, ..input })?;
            Ok((StatusCode::CREATED, value))
        },
    )
    .await
}

async fn submit_batch_for_approval_onchain(
    State(state): State<AppState>,
    headers: HeaderMap,
    AxumPath(batch_id): AxumPath<u64>,
    Json(payload): Json<Value>,
) -> Response {
    onchain_write_with_audit_and_idempotency(
        state,
        headers,
        "submit_batch_for_approval_onchain",
        format!("/batches/{batch_id}/submit"),
        payload,
        move |chain, body| {
            let input: PolicyOnlyInput = serde_json::from_value(body)
                .map_err(|e| anyhow!("invalid submit batch payload: {e}"))?;
            let value = chain.submit_batch_for_approval(BatchActionInput {
                policy: input.policy,
                batch_id,
            })?;
            Ok((StatusCode::OK, value))
        },
    )
    .await
}

async fn approve_batch_intent_onchain(
    State(state): State<AppState>,
    headers: HeaderMap,
    AxumPath(batch_id): AxumPath<u64>,
    Json(payload): Json<Value>,
) -> Response {
    onchain_write_with_audit_and_idempotency(
        state,
        headers,
        "approve_batch_intent_onchain",
        format!("/batches/{batch_id}/approve"),
        payload,
        move |chain, body| {
            let input: ApproveOnlyInput = serde_json::from_value(body)
                .map_err(|e| anyhow!("invalid approve batch payload: {e}"))?;
            let value = chain.approve_batch_intent(ApproveBatchInput {
                policy: input.policy,
                batch_id,
                approval_digest: parse_approval_digest(input.approval_digest)?,
            })?;
            Ok((StatusCode::OK, value))
        },
    )
    .await
}

async fn cancel_batch_intent_onchain(
    State(state): State<AppState>,
    headers: HeaderMap,
    AxumPath(batch_id): AxumPath<u64>,
    Json(payload): Json<Value>,
) -> Response {
    onchain_write_with_audit_and_idempotency(
        state,
        headers,
        "cancel_batch_intent_onchain",
        format!("/batches/{batch_id}/cancel"),
        payload,
        move |chain, body| {
            let input: PolicyOnlyInput = serde_json::from_value(body)
                .map_err(|e| anyhow!("invalid cancel batch payload: {e}"))?;
            let value = chain.cancel_batch_intent(BatchActionInput {
                policy: input.policy,
                batch_id,
            })?;
            Ok((StatusCode::OK, value))
        },
    )
    .await
}

fn parse_execution_mode(mode: Option<&str>) -> &'static str {
    match mode {
        Some("continue-on-error") => "continue-on-error",
        _ => "abort-on-error",
    }
}

async fn upsert_relayer(state: &AppState, record: &RelayerRecord) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO relayer_executions (
            intent_id, payment_intent, status, signature, failure_reason, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(intent_id) DO UPDATE SET
            payment_intent = excluded.payment_intent,
            status = excluded.status,
            signature = excluded.signature,
            failure_reason = excluded.failure_reason,
            updated_at = excluded.updated_at
        "#,
    )
    .bind(record.intent_id)
    .bind(&record.payment_intent)
    .bind(&record.status)
    .bind(&record.signature)
    .bind(&record.failure_reason)
    .bind(&record.updated_at)
    .execute(&state.pool)
    .await?;

    Ok(())
}

fn validate_execution_task(task: &ExecutionTask) -> Result<(), String> {
    if task.intent_id < 0 {
        return Err("intentId must be a non-negative integer".to_string());
    }
    if task.policy.trim().is_empty() {
        return Err("policy must be a non-empty string".to_string());
    }
    if task.payment_intent.trim().is_empty() {
        return Err("paymentIntent must be a non-empty string".to_string());
    }
    Ok(())
}

async fn process_execution_task(
    state: &AppState,
    task: &ExecutionTask,
) -> Result<RelayerRecord, String> {
    validate_execution_task(task)?;

    let now = Utc::now().to_rfc3339();
    let record = if task.should_fail.unwrap_or(false) {
        RelayerRecord {
            intent_id: task.intent_id,
            payment_intent: task.payment_intent.clone(),
            status: "failed".to_string(),
            signature: None,
            failure_reason: Some(
                task.failure_reason
                    .clone()
                    .unwrap_or_else(|| "relayer simulated failure".to_string()),
            ),
            updated_at: now,
        }
    } else {
        RelayerRecord {
            intent_id: task.intent_id,
            payment_intent: task.payment_intent.clone(),
            status: "submitted".to_string(),
            signature: Some(format!(
                "relayer-{}-{}",
                task.intent_id,
                Utc::now().timestamp_millis()
            )),
            failure_reason: None,
            updated_at: now,
        }
    };

    upsert_relayer(state, &record)
        .await
        .map_err(|e| format!("upsert relayer record failed: {e}"))?;

    Ok(record)
}

async fn list_executions(
    State(state): State<AppState>,
    Query(query): Query<ExecutionListQuery>,
) -> Response {
    if let Some(status) = &query.status {
        if !is_valid_execution_status(status) {
            let allowed = domain_contract().execution_statuses.join(", ");
            return json_error(
                StatusCode::BAD_REQUEST,
                format!("status must be one of: {allowed}"),
            );
        }
    }

    let rows = sqlx::query(
        r#"
        SELECT intent_id, payment_intent, status, signature, failure_reason, updated_at
        FROM relayer_executions
        ORDER BY updated_at DESC, intent_id DESC
        LIMIT 200
        "#,
    )
    .fetch_all(&state.pool)
    .await;

    match rows {
        Ok(rows) => {
            let items: Vec<RelayerRecord> = rows
                .into_iter()
                .filter_map(|row| {
                    let record = RelayerRecord {
                        intent_id: row.try_get("intent_id").ok()?,
                        payment_intent: row.try_get("payment_intent").ok()?,
                        status: row.try_get("status").ok()?,
                        signature: row.try_get("signature").ok(),
                        failure_reason: row.try_get("failure_reason").ok(),
                        updated_at: row.try_get("updated_at").ok()?,
                    };

                    if let Some(status) = &query.status {
                        if &record.status != status {
                            return None;
                        }
                    }

                    Some(record)
                })
                .collect();

            (StatusCode::OK, Json(json!({ "items": items }))).into_response()
        }
        Err(error) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("list executions failed: {error}"),
        ),
    }
}

async fn get_execution_by_intent(
    State(state): State<AppState>,
    AxumPath(intent_id): AxumPath<i64>,
) -> Response {
    let row = sqlx::query(
        r#"
        SELECT intent_id, payment_intent, status, signature, failure_reason, updated_at
        FROM relayer_executions
        WHERE intent_id = ?
        "#,
    )
    .bind(intent_id)
    .fetch_optional(&state.pool)
    .await;

    match row {
        Ok(Some(row)) => {
            let item = RelayerRecord {
                intent_id: row.try_get("intent_id").unwrap_or_default(),
                payment_intent: row.try_get("payment_intent").unwrap_or_default(),
                status: row.try_get("status").unwrap_or_default(),
                signature: row.try_get("signature").ok(),
                failure_reason: row.try_get("failure_reason").ok(),
                updated_at: row.try_get("updated_at").unwrap_or_default(),
            };

            (StatusCode::OK, Json(json!(item))).into_response()
        }
        Ok(None) => json_error(
            StatusCode::NOT_FOUND,
            format!("intent {intent_id} not found"),
        ),
        Err(error) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("get execution failed: {error}"),
        ),
    }
}

async fn create_execution(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(task): Json<ExecutionTask>,
) -> Response {
    if let Some(response) = ensure_write_auth(&state, &headers) {
        return response;
    }

    match process_execution_task(&state, &task).await {
        Ok(record) => (StatusCode::CREATED, Json(json!(record))).into_response(),
        Err(error) => json_error(StatusCode::BAD_REQUEST, error),
    }
}

async fn create_executions_batch(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<BatchExecutionInput>,
) -> Response {
    if let Some(response) = ensure_write_auth(&state, &headers) {
        return response;
    }

    if payload.items.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "items must be a non-empty array");
    }

    let mode = parse_execution_mode(payload.mode.as_deref());
    let mut results: Vec<Value> = Vec::new();

    for task in &payload.items {
        match process_execution_task(&state, task).await {
            Ok(record) => {
                let status = if record.status == "failed" {
                    "failed"
                } else {
                    "succeeded"
                };
                results.push(json!({
                    "intentId": task.intent_id,
                    "status": status,
                    "record": record,
                    "error": if status == "failed" { record.failure_reason } else { None::<String> }
                }));

                if status == "failed" && mode == "abort-on-error" {
                    break;
                }
            }
            Err(error) => {
                results.push(json!({
                    "intentId": task.intent_id,
                    "status": "failed",
                    "error": error,
                }));

                if mode == "abort-on-error" {
                    break;
                }
            }
        }
    }

    let succeeded = results
        .iter()
        .filter(|item| item.get("status") == Some(&json!("succeeded")))
        .count();
    let failed = results.len().saturating_sub(succeeded);

    let response = json!({
        "mode": mode,
        "total": payload.items.len(),
        "processed": results.len(),
        "succeeded": succeeded,
        "failed": failed,
        "results": results,
    });

    let status = if failed == 0 {
        StatusCode::CREATED
    } else {
        StatusCode::MULTI_STATUS
    };

    (status, Json(response)).into_response()
}

async fn confirm_execution(
    State(state): State<AppState>,
    headers: HeaderMap,
    AxumPath(intent_id): AxumPath<i64>,
) -> Response {
    if let Some(response) = ensure_write_auth(&state, &headers) {
        return response;
    }

    let row = sqlx::query(
        r#"
        SELECT intent_id, payment_intent, status, signature, failure_reason, updated_at
        FROM relayer_executions
        WHERE intent_id = ?
        "#,
    )
    .bind(intent_id)
    .fetch_optional(&state.pool)
    .await;

    let row = match row {
        Ok(Some(row)) => row,
        Ok(None) => {
            return json_error(
                StatusCode::NOT_FOUND,
                format!("intent {intent_id} not found in relayer store"),
            )
        }
        Err(error) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("confirm lookup failed: {error}"),
            )
        }
    };

    let record = RelayerRecord {
        intent_id: row.try_get("intent_id").unwrap_or_default(),
        payment_intent: row.try_get("payment_intent").unwrap_or_default(),
        status: "confirmed".to_string(),
        signature: row.try_get("signature").ok(),
        failure_reason: row.try_get("failure_reason").ok(),
        updated_at: Utc::now().to_rfc3339(),
    };

    match upsert_relayer(&state, &record).await {
        Ok(_) => (StatusCode::OK, Json(json!(record))).into_response(),
        Err(error) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("confirm execution failed: {error}"),
        ),
    }
}

async fn list_timeline(
    State(state): State<AppState>,
    Query(query): Query<TimelineListQuery>,
) -> Response {
    if let Some(source) = &query.source {
        if !is_valid_timeline_source(source) {
            let allowed = domain_contract().timeline_sources.join(", ");
            return json_error(
                StatusCode::BAD_REQUEST,
                format!("source must be one of: {allowed}"),
            );
        }
    }

    let rows = sqlx::query(
        r#"
        SELECT intent_id, status, source, observed_at, details_json
        FROM indexer_timeline
        ORDER BY id DESC
        LIMIT 500
        "#,
    )
    .fetch_all(&state.pool)
    .await;

    match rows {
        Ok(rows) => {
            let items: Vec<TimelineRecord> = rows
                .into_iter()
                .filter_map(|row| {
                    let intent_id: i64 = row.try_get("intent_id").ok()?;
                    let source: String = row.try_get("source").ok()?;

                    if query.intent_id.is_some() && query.intent_id != Some(intent_id) {
                        return None;
                    }

                    if let Some(filter_source) = &query.source {
                        if filter_source != &source {
                            return None;
                        }
                    }

                    Some(TimelineRecord {
                        intent_id,
                        status: row.try_get("status").ok()?,
                        source,
                        observed_at: row.try_get("observed_at").ok()?,
                        details: row
                            .try_get::<String, _>("details_json")
                            .ok()
                            .and_then(|v| serde_json::from_str::<Value>(&v).ok())
                            .unwrap_or_else(|| json!({})),
                    })
                })
                .collect();

            (StatusCode::OK, Json(json!({ "items": items }))).into_response()
        }
        Err(error) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("list timeline failed: {error}"),
        ),
    }
}

async fn append_timeline(
    state: &AppState,
    source: &str,
    payload: TimelineWriteInput,
) -> Result<Value, String> {
    if payload.intent_id < 0 {
        return Err("intentId must be a non-negative integer".to_string());
    }

    if payload.status.trim().is_empty() {
        return Err("status must be a non-empty string".to_string());
    }

    let entry = json!({
        "intentId": payload.intent_id,
        "status": payload.status.trim(),
        "source": source,
        "observedAt": Utc::now().to_rfc3339(),
        "details": payload.details.unwrap_or_else(|| json!({})),
    });

    let details_json = entry
        .get("details")
        .cloned()
        .unwrap_or_else(|| json!({}))
        .to_string();

    sqlx::query(
        r#"
        INSERT INTO indexer_timeline (
            intent_id, status, source, observed_at, details_json
        ) VALUES (?, ?, ?, ?, ?)
        "#,
    )
    .bind(payload.intent_id)
    .bind(payload.status.trim())
    .bind(source)
    .bind(
        entry
            .get("observedAt")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    )
    .bind(details_json)
    .execute(&state.pool)
    .await
    .map_err(|e| format!("append timeline failed: {e}"))?;

    Ok(entry)
}

async fn write_timeline_chain(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<TimelineWriteInput>,
) -> Response {
    if let Some(response) = ensure_write_auth(&state, &headers) {
        return response;
    }

    match append_timeline(&state, "chain", payload).await {
        Ok(entry) => (StatusCode::CREATED, Json(entry)).into_response(),
        Err(error) => json_error(StatusCode::BAD_REQUEST, error),
    }
}

async fn write_timeline_relayer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<TimelineWriteInput>,
) -> Response {
    if let Some(response) = ensure_write_auth(&state, &headers) {
        return response;
    }

    match append_timeline(&state, "relayer", payload).await {
        Ok(entry) => (StatusCode::CREATED, Json(entry)).into_response(),
        Err(error) => json_error(StatusCode::BAD_REQUEST, error),
    }
}

async fn get_summary(State(state): State<AppState>) -> Response {
    let audit_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM control_plane_audit_logs")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    let execution_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM relayer_executions")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    let timeline_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM indexer_timeline")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "stage": "rust-unified-api",
            "integration": {
                "controlPlane": false,
                "rustOnchainEntry": true,
                "relayer": true,
                "indexer": true
            },
            "counts": {
                "auditLogs": audit_count,
                "executions": execution_count,
                "timeline": timeline_count
            },
            "runtime": "tokio+axum"
        })),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::header::HeaderValue;

    #[test]
    fn request_hash_changes_with_payload() {
        let a = request_hash("POST", "/intents", &json!({ "intentId": 1 }));
        let b = request_hash("POST", "/intents", &json!({ "intentId": 2 }));
        assert_ne!(a, b);
    }

    #[test]
    fn generated_intent_id_and_reference_are_stable_format() {
        let first = generate_intent_id();
        let second = generate_intent_id();
        assert!(second >= first);

        let reference = generate_reference(first);
        assert!(reference.starts_with("auto-"));
        assert!(reference.contains(&first.to_string()));
    }

    #[test]
    fn idempotency_key_trims_and_ignores_blank() {
        let mut headers = HeaderMap::new();
        headers.insert("Idempotency-Key", HeaderValue::from_static("  key-1  "));
        assert_eq!(idempotency_key(&headers), Some("key-1".to_string()));

        headers.insert("Idempotency-Key", HeaderValue::from_static("   "));
        assert_eq!(idempotency_key(&headers), None);
    }

    #[test]
    fn execution_mode_defaults_to_abort() {
        assert_eq!(parse_execution_mode(None), "abort-on-error");
        assert_eq!(
            parse_execution_mode(Some("continue-on-error")),
            "continue-on-error"
        );
        assert_eq!(
            parse_execution_mode(Some("anything-else")),
            "abort-on-error"
        );
    }

    #[test]
    fn parse_approval_digest_defaults_to_zeroes() {
        let digest = parse_approval_digest(None).expect("default digest");
        assert_eq!(digest, [0_u8; 32]);
    }

    #[test]
    fn parse_approval_digest_rejects_invalid_length() {
        let result = parse_approval_digest(Some(vec![1_u8, 2_u8, 3_u8]));
        assert!(result.is_err());
    }

    #[test]
    fn read_api_key_from_header_and_bearer() {
        let mut headers = HeaderMap::new();
        headers.insert("x-api-key", HeaderValue::from_static("key-1"));
        assert_eq!(read_api_key(&headers), Some("key-1".to_string()));

        headers.remove("x-api-key");
        headers.insert(
            "authorization",
            HeaderValue::from_static("Bearer bearer-token"),
        );
        assert_eq!(read_api_key(&headers), Some("bearer-token".to_string()));
    }

    #[test]
    fn execution_task_validation_rejects_bad_inputs() {
        let invalid = ExecutionTask {
            policy: "".to_string(),
            intent_id: 1,
            payment_intent: "intent-1".to_string(),
            should_fail: None,
            failure_reason: None,
        };
        assert!(validate_execution_task(&invalid).is_err());

        let valid = ExecutionTask {
            policy: "policy-1".to_string(),
            intent_id: 1,
            payment_intent: "intent-1".to_string(),
            should_fail: None,
            failure_reason: None,
        };
        assert!(validate_execution_task(&valid).is_ok());
    }

    #[test]
    fn domain_contract_includes_execution_and_timeline_enums() {
        let contract = domain_contract();
        assert!(contract
            .execution_statuses
            .iter()
            .any(|value| value == "submitted"));
        assert!(contract
            .execution_statuses
            .iter()
            .any(|value| value == "confirmed"));
        assert!(contract
            .timeline_sources
            .iter()
            .any(|value| value == "chain"));
        assert!(contract
            .timeline_sources
            .iter()
            .any(|value| value == "relayer"));
    }

    #[tokio::test]
    async fn init_db_creates_required_tables() {
        let path =
            std::env::temp_dir().join(format!("policypay-api-rs-test-{}.sqlite", Uuid::new_v4()));
        ensure_parent_dir(path.to_str().unwrap()).expect("ensure parent dir");

        let connect_options = SqliteConnectOptions::new()
            .filename(&path)
            .create_if_missing(true);
        let pool = SqlitePool::connect_with(connect_options)
            .await
            .expect("connect sqlite");
        init_db(&pool).await.expect("init db");

        let table_count = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*)
            FROM sqlite_master
            WHERE type = 'table'
              AND name IN (
                'idempotency_records',
                'control_plane_audit_logs',
                'relayer_executions',
                'indexer_timeline'
              )
            "#,
        )
        .fetch_one(&pool)
        .await
        .expect("count tables");

        assert_eq!(table_count, 4);

        let _ = std::fs::remove_file(path);
    }
}
