export const openapiProd = {
  openapi: "3.0.3",
  info: { title: "Dom Monitor — PROD API", version: "1.0.0" },
  servers: [{ url: "https://api.dom-monitor.ru" }],
  components: {
    securitySchemes: {
      BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }
    },
    schemas: {
      Reading: {
        type: "object",
        required: ["house_id","ts","src","volume_m3"],
        properties: {
          house_id: { type: "string", format: "uuid" },
          ts:       { type: "string", format: "date-time" },
          src:      { type: "string", enum: ["ITP_CW","ODPU_SUPPLY","ODPU_RETURN","ODPU_CONSUMPTION"] },
          volume_m3:{ type: "number", minimum: 0 }
        }
      },
      BatchReadings: {
        type: "object",
        required: ["items"],
        properties: { items: { type: "array", items: { $ref: "#/components/schemas/Reading" }, minItems: 1, maxItems: 1000 } }
      }
    }
  },
  security: [{ BearerAuth: [] }],
  tags: [
    { name: "Readings" },
    { name: "Dashboard" },
    { name: "Anomalies" }
  ],
  paths: {
    "/v1/readings": {
      post: {
        tags: ["Readings"],
        summary: "Upsert one reading",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Reading" } } }
        },
        responses: { "200": { description: "OK" }, "401": { description: "Unauthorized" }, "422": { description: "Validation error" } }
      }
    },
    "/v1/readings/batch": {
      post: {
        tags: ["Readings"],
        summary: "Upsert batch of readings",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/BatchReadings" } } }
        },
        responses: { "202": { description: "Accepted" }, "401": { description: "Unauthorized" }, "422": { description: "Validation error" } }
      }
    },
    "/v1/dashboard/head": {
      post: {
        tags: ["Dashboard"],
        summary: "Get dashboard head",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            properties: {
              house_id: { type: "string", format: "uuid", nullable: true },
              p_range: { type: "array", items: { type: "string", format: "date-time" }, minItems: 2, maxItems: 2 },
              p_period: { type: "string", default: "30 дней" },
              p_realtime: { type: "boolean", default: false },
              p_window_hours: { type: "integer", default: 6 },
              p_granularity: { type: "string", enum: ["auto","hour","day","week","month"], default: "auto" },
              p_tz: { type: "string", default: "Europe/Moscow" }
            }
          } } }
        },
        responses: { "200": { description: "OK" }, "401": { description: "Unauthorized" }, "422": { description: "Validation error" } }
      }
    },
    "/v1/anomalies/{house_id}": {
      post: {
        tags: ["Anomalies"],
        summary: "List anomalies for house",
        parameters: [
          { in: "path", name: "house_id", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            properties: {
              from: { type: "string", format: "date-time" },
              to: { type: "string", format: "date-time" },
              severity: { type: "array", items: { type: "string", enum: ["info","warn","critical"] } },
              limit: { type: "integer", default: 50 },
              offset: { type: "integer", default: 0 },
              order: { type: "string", enum: ["asc","desc"], default: "desc" }
            }
          } } }
        },
        responses: { "200": { description: "OK" }, "401": { description: "Unauthorized" }, "422": { description: "Validation error" } }
      }
    },
    "/v1/healthz": {
      get: {
        tags: ["Readings"],
        summary: "Service health (prod)",
        responses: { "200": { description: "OK" } }
      }
    }
  }
};
