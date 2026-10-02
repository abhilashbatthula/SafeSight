# Five-minute demonstration

Start with `pnpm setup:dev`, `pnpm dev`, then open http://localhost:8080. Generated passwords are in `.runtime/dev-credentials.json`; do not include them in screenshots or a submission. Use two private browser contexts to keep separate staff sessions.

1. **0:00 – Normal observations:** Sign in as Admin. Open Overview. Explain the simulated environmental label, US AQI scale, facility timezone and timestamps. Open a zone and view its persisted trend. A Viewer can read but cannot run scenarios or upload.
2. **0:45 – PPE snapshot:** Open PPE inspections, select a zone, click Run review sample. Show QUEUED → PROCESSING → COMPLETED (transient states may be short). Explain that this is an original schematic DEMO fixture with fixed annotations, not AI. Show responsive boxes, person references, unknown/missing distinctions and the immutable model result. Confirm a finding with notes and inspect the audit history. Arbitrary uploads fail honestly until REAL weights are configured.
3. **1:30 – Temperature event:** In Simulation Controls, target Production Floor and start Rising temperature. After gradual heating and three consecutive breaches, show a deduplicated incident. Default temperature limit is 35°C, explicitly an educational demonstration rule.
4. **2:15 – Matching clients:** Open a second browser at 390px or a phone if LAN access was configured. Both clients display the same persisted observations and timestamps. Browser emulation is verified separately from physical phone scanning. Disconnect/reconnect a browser and see fresh authoritative state.
5. **3:00 – Acknowledge:** Safety Officer opens the temperature incident, writes an investigation note and acknowledges it. Condition stays active. Attempting resolution without recovery/override is blocked.
6. **3:30 – Recovery:** Admin selects Gradual recovery. After required observations below the hysteresis boundary, condition becomes recovered; the incident remains acknowledged. Safety Officer resolves with a reason. The history and action audit stay visible.
7. **4:30 – Export:** Analytics & reports → select zone and Last hour → readings/incidents/inspections CSV. Explain reviewed-person denominator, separate unknown and unreviewed counts, UTC timestamps, and private export scope.

Optional: interrupt a zone's readings, wait beyond the stale limit and show unknown freshness without hiding a critical unresolved incident. Settings → QR explains configuration when PUBLIC_APP_URL is empty. Once reachable URL is configured, demonstrate a staff QR or expiring scoped guest link and revoke it while the guest stream is open.

Reset is deliberately separate: Admin must type RESET DEMO; it deletes this facility's demo readings/images/inspection/incident history and preserves accounts/rules. Never reset a user's existing database as part of routine startup.
