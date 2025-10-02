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

│─ src/                # исходники TypeScript

│  │─ index.ts         # сервер, Swagger, роутинг

│  │─ api_v1.ts        # REST /v1 (PROD)

│  │─ ingest.ts        # upsert измерений в jkh_readings

│  │─ supabase.ts      # клиент Supabase

│  │─ scenarios.ts     # генерация профилей/сценариев

│  │─ …                # прочие модули

│─ dist/               # (опционально) сборка JS (npm run build)

│─ public/             # статические ресурсы (WeWeb build, фронт для демо)

│  │─ index.html       # точка входа WeWeb-приложения (SPA)

│─ month_load.sh       # пример массовой загрузки

─ package.json


├─ tsconfig.json

├─ .env.example

└─ README.md

### Папка `public/`

В `public/` разворачивается собранный билд **WeWeb**
Express автоматически отдаёт статику из этой папки, чтобы демонстрационный интерфейс был доступен на том же домене, что и API.  

Пример подключения в `src/index.ts`:

```ts
import express from "express";
const app = express();

// REST API
app.use("/v1", apiV1);

// Статические файлы (WeWeb build)
app.use(express.static("public"));

// теперь index.html доступен по https://api.dom-monitor.ru/

Таким образом, на одном сервере доступны:
	•	REST API (PROD) — приём реальных данных;
	•	Demo UI (WeWeb) — панель для тестовой генерации и визуализации.

⸻

Требования
	•	Node.js 18+
	•	Доступ к Supabase (URL + Service Key)
	•	Созданные таблицы/представления в БД:
jkh_readings, jkh_houses, jkh_anomalies,
jkh_hourly_house (MV) и функции public.jkh_refresh_pipeline, public.jkh_get_dashboard_head.

⸻

Переменные окружения

Создайте .env на основе .env.example:

# базовые
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SCHEMA=public
SUPABASE_TABLE=jkh_readings

SEED_DAYS=7       
TICK_MS=60000     
PORT=8787
API_KEYS=YOUR_KEY,ANOTHER_KEY,TEST_KEY


## Инфраструктура Supabase/Postgres

Сервер API не хранит данные локально — всё складывается в Supabase (Postgres).  
Необходимо поднять/иметь доступ к инстансу с такими объектами:

### Основные таблицы
- `jkh_houses` — список домов (id, адрес, scheme_type …)
- `jkh_readings` — сырые показания (ts, house_id, src, volume_m3 …)
- `jkh_anomalies` — зафиксированные аномалии (ts, house_id, severity, delta_m3, deviation_pct …)

### Материализованные представления
- `jkh_hourly_house` — агрегация показаний по дому и часу

### Функции
- `public.jkh_refresh_pipeline(p_house uuid, p_hours int, p_threshold int)`  
  обновляет матвью и пересчитывает аномалии
- `public.jkh_get_dashboard_head(...)`  
  возвращает данные для дашборда (серии, тепловая карта, распределения)

### Индексы
- `(ts, house_id, src)` — уникальный для показаний
- `(house_id, ts)` — для аномалий

### Роли и права
- сервисный ключ (`SUPABASE_SERVICE_ROLE_KEY`) используется только бекендом
- клиентские ключи (`anon`) в демо не применяются
- для выполнения `refresh materialized view` нужен владелец MV или SECURITY DEFINER на функции

---

## Связка компонентов

1. **PROD API** получает показания через `/v1/readings` и кладёт в `jkh_readings`.
2. **Функция `jkh_refresh_pipeline`** обновляет агрегации и вызывает детекцию аномалий.
3. **Материализованное представление** хранит почасовые агрегаты (`jkh_hourly_house`).
4. **Демо API** (`/simulate/run`) генерирует тестовые данные и тоже прогоняет пайплайн.
5. **WeWeb build в /public** показывает графики (через RPC-функции `jkh_get_dashboard_head`).

Таким образом README становится самодостаточным: любой, кто его откроет, поймёт что нужно иметь в базе и как API взаимодействует с Supabase.

Хочешь, я вставлю этот блок сразу в твой README.md между “Требования” и “Переменные окружения”?
