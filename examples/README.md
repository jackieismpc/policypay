# PolicyPay Examples

## 示例 1：Control Plane 创建单笔 intent

```bash
curl -X POST http://127.0.0.1:4010/intents \
  -H 'Content-Type: application/json' \
  -d '{
    "policy": "<policy-pda>",
    "intentId": 101,
    "recipient": "<recipient-pubkey>",
    "amount": 100,
    "memo": "invoice-101",
    "reference": "ref-101"
  }'
```

## 示例 2：Control Plane 批量创建 intent

```bash
curl -X POST http://127.0.0.1:4010/intents/batch \
  -H 'Content-Type: application/json' \
  -d '{
    "policy": "<policy-pda>",
    "mode": "continue-on-error",
    "items": [
      {
        "intentId": 201,
        "recipient": "<recipient-a>",
        "amount": 120,
        "memo": "invoice-201",
        "reference": "ref-201"
      },
      {
        "intentId": 202,
        "recipient": "<recipient-b>",
        "amount": 220,
        "memo": "invoice-202",
        "reference": "ref-202"
      }
    ]
  }'
```

## 示例 3：Control Plane 批量审批

```bash
curl -X POST http://127.0.0.1:4010/intents/batch/approve \
  -H 'Content-Type: application/json' \
  -d '{
    "policy": "<policy-pda>",
    "mode": "abort-on-error",
    "intentIds": [201, 202],
    "approvalDigest": [7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7]
  }'
```

## 示例 4：Relayer 批量执行

```bash
curl -X POST http://127.0.0.1:4020/executions/batch \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "continue-on-error",
    "items": [
      {
        "policy": "<policy-pda>",
        "intentId": 201,
        "paymentIntent": "<intent-pda-201>"
      },
      {
        "policy": "<policy-pda>",
        "intentId": 202,
        "paymentIntent": "<intent-pda-202>",
        "shouldFail": true,
        "failureReason": "simulated relayer error"
      }
    ]
  }'
```

## 示例 5：Indexer 写入和查询时间线

```bash
curl -X POST http://127.0.0.1:4040/timeline/chain \
  -H 'Content-Type: application/json' \
  -d '{
    "intentId": 201,
    "status": "approved",
    "details": {"policy": "<policy-pda>"}
  }'

curl -X POST http://127.0.0.1:4040/timeline/relayer \
  -H 'Content-Type: application/json' \
  -d '{
    "intentId": 201,
    "status": "submitted",
    "details": {"signature": "sig-201"}
  }'

curl 'http://127.0.0.1:4040/timeline?intentId=201'
```

## 示例 6：Agent Adapter CSV draft（单笔）

CSV 输入：

```text
recipient-1,100,invoice-1,ref-1
```

输出结构：

```json
{
  "source": "csv",
  "recipient": "recipient-1",
  "amount": 100,
  "memo": "invoice-1",
  "reference": "ref-1",
  "requiresHumanApproval": true,
  "warnings": [
    "draft generated from csv input",
    "human approval required before onchain create_intent"
  ]
}
```

## 示例 7：Agent Adapter CSV draft（批量）

CSV 多行输入：

```text
recipient-1,100,invoice-1,ref-1
recipient-2,200,invoice-2,ref-2
```

输出结构（节选）：

```json
{
  "source": "csv",
  "items": [
    {
      "recipient": "recipient-1",
      "amount": 100
    },
    {
      "recipient": "recipient-2",
      "amount": 200
    }
  ],
  "requiresHumanApproval": true
}
```
