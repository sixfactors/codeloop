# Contract entry: {method} {path}

<!-- One of these per endpoint touched by this card. Append to the service's contract doc, or
     start one at the path docs/architecture.md names for service contracts if none exists. -->

**Summary:** what the caller can now do, one sentence.

**Request**

| Field | Type | Required | Notes |
|---|---|---|---|
| | | | |

**Response (success)**

```
status: 200 | 201 | 204
{
  <shape, exactly as it comes back, not the internal model>
}
```

**Response (errors)**

| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | |
| 401 | UNAUTHORIZED | |
| 404 | NOT_FOUND | |
| 409 | CONFLICT | |

**Pagination** (list endpoints only): `page` (1-indexed), `limit`, response carries `total`,
`totalPages`, `hasNext`, `hasPrev`.

**Tenant scope:** which key scopes every query (`workspaceId`, `orgId`, ...), and whether a
cross-tenant read returns 404 (invisible) or 403 (visible but forbidden), pick one and be
consistent with the rest of the service.

**Backwards compatibility:** additive (new field/route) | breaking (flag why, and what the sdk/ui
stages must change in the same card).
