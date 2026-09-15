# Data-handling inventory — pre-release review

This is an implementation inventory, not a completed legal privacy policy.

| Data | Current behavior | Retention/control |
|---|---|---|
| Local GLB | Read and rendered in the browser; SHA-256 computed locally; external buffer/image URLs rejected | Memory only; selecting a different file/unmount releases resources |
| DEMO prompt | Local deterministic scene recipe, or the same recipe through the local API | Scene result may enter device archive; reference image is not analyzed |
| LIVE prompt/reference | Sent to our Worker and OpenAI Responses API only after LIVE activation | Worker has no application database and requests `store:false`; provider/platform policies still apply |
| Scene archive | Successful blueprint, result mode/model/request ID, local record ID and timestamp in local storage | Up to 30 records; browser storage clearing removes it; no cloud backup |
| Quote controls | Local cost arithmetic using entered assumptions | No automatic supplier request or purchase from the site |
| Client IP | Used by the deployment rate limiter | Hosting/provider retention requires account-level review |
| Operational logs | No application request-body logging; Wrangler observability disabled in configuration | Hosting and provider account logging settings need review |

The app now links `/privacy` and `/terms`; matching release drafts are `PRIVACY.md` and `TERMS.md`. The global quota stores only reserved attempts; preview codes are kept in page memory, and LIVE evidence may store response IDs, hashes and token counts. Before publication, identify the actual operator/contact, applicable provider settings, retention/deletion route and notice displayed beside LIVE input. Do not promise anonymity, zero retention or regulatory compliance based solely on this code. No advertising/analytics SDK was added in this branch.
