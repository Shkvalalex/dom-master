# Dom Monitor — API & Simulator

Сервис для приёма показаний счётчиков (PROD REST API) и генерации демо-данных (DEMO).  
Используется вместе с Supabase/Postgres для агрегации почасовых данных и детекции аномалий.

## Живые спецификации (Swagger UI)

- PROD API: https://api.dom-monitor.ru/docs/prod/
- DEMO API: https://api.dom-monitor.ru/docs/demo/

JSON-спеки:
- https://api.dom-monitor.ru/openapi.prod.json
- https://api.dom-monitor.ru/openapi.demo.json

---

## Структура
├─ src/                # исходники TypeScript
│  ├─ index.ts         # сервер, Swagger, роутинг
│  ├─ api_v1.ts        # REST /v1 (PROD)
│  ├─ ingest.ts        # upsert измерений в jkh_readings
│  ├─ supabase.ts      # клиент Supabase
│  ├─ scenarios.ts     # генерация профилей/сценариев
│  └─ …              # прочие модули
├─ dist/               # (опционально) сборка JS (npm run build)
├─ month_load.sh       # пример массовой загрузки
├─ package.json
├─ tsconfig.json
├─ .env.example
└─ README.md

---

## Требования

- Node.js 18+
- Доступ к Supabase (URL + Service Key)
- Созданные таблицы/представления в БД: `jkh_readings`, `jkh_houses`, `jkh_anomalies`, `jkh_hourly_house (MV)` и функции `public.jkh_refresh_pipeline`, `public.jkh_get_dashboard_head` (см. SQL в проекте).

---

## Переменные окружения

Создайте `.env` на основе `.env.example`:

```env
# базовые
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_ANON_KEY=your-supabase-anin-key
SUPABASE_SCHEMA=public
SUPABASE_TABLE=jkh_readings

SEED_DAYS=7       
TICK_MS=60000     
PORT=8787
API_KEYS=YOUR_KEY,ANOTHER_KEY,TEST_KEY


