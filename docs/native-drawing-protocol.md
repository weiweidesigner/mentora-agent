# Native drawing integration

JEV already used the native v2 catalog (43 types), but the host pinned
`us-trading-charts` at `a104974`, whose renderer only accepted the older subset.
The richer renderer was present on `codex/kline-native-marks-v2` (`4bba257`), not
on the dependency's main branch. Payload-only tests did not detect that valid
JEV marks could be dropped by the browser normalizer.

The host now pins `397c6f4`, integrating that drawing commit onto `a104974` and
retaining later live configuration, line/MA, Pine, title and period contracts.
The dependency integration branch is `codex/mentora-native-marks-integration`.
Renderer and JEV type definitions, aliases, formulas and explicit unsupported
families are compared directly in a host regression test. Native canvas helpers
are executed for every catalog type at mobile and desktop widths. This uses the
existing business K-line, not a second renderer or a TradingView iframe SDK.

Saved charts without `data-kline-drawings=2` are upgraded from their embedded
OHLCV only, retaining annotations and visual configuration. Reading a chart
does not repeat research, fetch quotes or alter its saved source file. Updated
charts carry the version marker, making upgrades idempotent.

Single-period charts omit their period nav; multiple periods retain selection.
Dashboard loading cards retain only their spinner; detailed progress appears
once in the existing composer status area.
