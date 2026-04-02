use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

const DOMAIN_CONTRACT_JSON: &str = include_str!("../../../modules/domain/contract.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainErrorCode {
    pub code: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainContract {
    pub version: String,
    #[serde(rename = "intentStatuses")]
    pub intent_statuses: Vec<String>,
    #[serde(rename = "batchStatuses")]
    pub batch_statuses: Vec<String>,
    #[serde(rename = "executionStatuses")]
    pub execution_statuses: Vec<String>,
    #[serde(rename = "timelineSources")]
    pub timeline_sources: Vec<String>,
    #[serde(rename = "batchModes")]
    pub batch_modes: Vec<String>,
    pub events: Vec<String>,
    #[serde(rename = "errorCodes")]
    pub error_codes: Vec<DomainErrorCode>,
}

pub fn domain_contract() -> &'static DomainContract {
    static CONTRACT: OnceLock<DomainContract> = OnceLock::new();

    CONTRACT.get_or_init(|| {
        serde_json::from_str(DOMAIN_CONTRACT_JSON)
            .expect("modules/domain/contract.json must be valid JSON")
    })
}

pub fn is_valid_execution_status(status: &str) -> bool {
    domain_contract()
        .execution_statuses
        .iter()
        .any(|value| value == status)
}

pub fn is_valid_timeline_source(source: &str) -> bool {
    domain_contract()
        .timeline_sources
        .iter()
        .any(|value| value == source)
}
