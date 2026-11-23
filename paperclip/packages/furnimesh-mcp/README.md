# FurniMesh MCP connector

This package exposes the public FurniMesh GLB library over MCP Streamable HTTP.
It reads bounded public HTML pages on demand and never downloads or indexes the
whole catalog. It exposes:

- `list_furniture_categories`
- `search_furniture`
- `get_furniture_details`
- `get_model_glb_url`
- `preview_furniture`
- `check_asset_compatibility`

Run `pnpm --filter @paperclipai/furnimesh-mcp build` and then
`pnpm --filter @paperclipai/furnimesh-mcp exec furnimesh-mcp` (default
`http://127.0.0.1:3180/mcp`). Configure that URL as Paperclip's FurniMesh
remote-MCP connector. The server binds to loopback by default; put it behind a
TLS/authenticated gateway before exposing it remotely.
