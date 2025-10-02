export const openapiDemo = {
  openapi: "3.0.3",
  info: { title: "Dom Monitor — DEMO API", version: "1.0.0" },
  servers: [{ url: "https://api.dom-monitor.ru" }],
  tags: [{ name: "Demo" }],
  paths: {

    "/simulate/run": {
      post: {
        tags: ["Demo"],
        summary: "Run demo simulator (batch or realtime)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: ["house_id"],
            properties: {
              house_id: { type: "string", format: "uuid" },
              season: { type: "string", enum: ["WINTER","SPRING","SUMMER","AUTUMN"] },
              scenario: { type: "string", enum: ["SEASON_BASE","PEAK","DROP","SENSOR_DRIFT"] },
              mode: { type: "string", enum: ["BATCH_DAY","BATCH_WEEK","REALTIME"], default: "BATCH_DAY" },
              hours: { type: "integer" },
              step_sec: { type: "integer", description: "Realtime tick step (sec)" },
              iterations: { type: "integer", description: "Realtime number of ticks" }
            }
          } } }
        },
        responses: { "200": { description: "OK" }, "400": { description: "Bad request" }, "500": { description: "Internal error" } }
      }
    },
    "/v1/healthz": {
      get: {
        tags: ["Demo"],
        summary: "Service health (shared)",
        responses: { "200": { description: "OK" } }
      }
    }
  }
};
