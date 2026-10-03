# ME-078/ME-080 — Аккаунты логин-пароль: вход владельца, ui-токен под капот

- Status: **Draft for review** (SE design; реализация в том же срезе,
  ветка `feat/me080-accounts`; мерж — только после каскад-ревью
  security-аудитора)
- Author: Senior System Engineer
- Related: ADR 0014 (owner session — stateless-cookie `vesmaro_ui`,
  остаётся в силе, не пересматривается), ADR 0009 (токен-сплит
  ui/machine — остаётся), dressing map §1.1.6 (И2: вкладки
  «Вход|Регистрация» — FE-срез), owner directive 2026-10-01 (вход по
  логину-паролю; ui-токен становится подкапотной частью)
- Директива владельца (дословно, 2026-10-01): вход по логину-паролю
  (показал себя удобнее в прошлой версии интерфейса), а ui-токен
  становится подкапотной частью — как токен сессии, владелец его никогда
  не вводит руками. ТОКЕН ОСТАЁТСЯ действительным для машин.

## 1. Проблема

Единственный способ войти в UI сегодня — вставить секрет
(`vesmaro_ui`-сессия поверх ui-токена, ADR 0014). Секрет — это
machine-материал: его неудобно вводить человеком, невозможно запомнить,
его подсказка уже однажды сломала вход (подсказка на /auth называет
секрет `vesma-eyes-ui-token`; каноничное имя по RUNBOOK/чарту —
`vesmaro-eyes-ui-token`). Владелец решил: человек входит логином-паролем;
токен остаётся служебным секретом для машин (CI, поллер, провижининг).

Рамка: UI-проект уже готов (вкладки «Вход|Регистрация», dressing map
§1.1.6, И2) — этот срез делает ТОЛЬКО серверную поверхность под него.
FE-формы — следующий срез. Пейринг/устройства не трогаются.

## 2. Решение (одно предложение)

Локальная таблица аккаунтов (username + scrypt-хэш пароля) и серверные
сессии в cookie `vesmaro_auth` (HttpOnly, SameSite=Strict, скользящий
idle-TTL 6ч — тот же класс допуска, что ui-токен); регистрация открыта
только для первого аккаунта (он = владелец борта), дальше — флагом
деплоя; ui-токен и `vesmaro_ui` не тронуты ни байтом.

## 3. Модель аккаунтов

```
accounts:
  id            INTEGER PK AUTOINCREMENT
  username      TEXT UNIQUE NOT NULL     -- 3..32, [a-z0-9_-], хранится lowercase
  password_hash TEXT NOT NULL            -- 'scrypt$N$r$p$salthex$hashhex'
  role          TEXT CHECK IN ('owner','member') DEFAULT 'owner'
  created_at    TEXT NOT NULL
  last_login_at TEXT NOT NULL DEFAULT ''
```

### 3.1 Хранение паролей: scrypt (stdlib), честное отклонение от «argon2/bcrypt»

Директива называет argon2/bcrypt как класс решения. В рантайме борда ни
argon2-cffi, ни bcrypt нет; тащить новый нативный пакет в image/QA-контур
ради одного хэша — supply-chain дельта без выигрыша в классе защиты.
Выбор: **hashlib.scrypt** (stdlib, memory-hard KDF из того же OWASP
списка: N=2^15, r=8, p=1, соль 16Б, ключ 32Б). Формат хэша несёт
идентификатор алгоритма и параметры (`scrypt$32768$8$1$…`) — переход на
argon2id позже это новая ветка в `verify_password`, старые хэши
продолжают проверяться (upgrade seam). Отклонение честно зафиксировано;
если АРХКОМ посчитает argon2id обязательным буква-в-букву — замена
локализована в `server/security.py`.

- Проверка пароля: `hmac.compare_digest` итоговых ключей (внутри
  `hashlib.scrypt` это даже не нужно — но формат сравниваем по полям,
  ключи по digest).
- Неверные параметры в сохранённом хэше → `False`, никогда не raise
  (битая строка не превращается в 500).
- Санкции против перебора: scrypt-стоимость самого хэша + лимитеры §5.
- Timing-equalization: логин с несуществующим именем прогоняет такой же
  scrypt по module-level dummy-хэшу — время ответа не выдаёт, существует
  ли имя (401 detail у обоих исходов одинаковый).

### 3.2 Политика пароля

NIST SP 800-63B: длина 8..512, без составных правил (никаких «обязательно
цифра и заглавная»), без подсказок. Проверка по списку утечёк — out of
scope (single-owner LAN).

### 3.3 Роли

`owner` — первый созданный аккаунт (вердикт владельца 07k §10-аддендум:
«первый созданный аккаунт становится владельцем борта»). `member` —
аккаунты, созданные при открытом флагом деплоя. В v1 права обоих
одинаковы (тот же класс допуска, что ui-сессия); поле роли существует
для FE-чипа пользователя и будущих read-only членов. Регистрация:

- accounts пуст → `POST /api/auth/register` открыт, создаёт `owner`;
- иначе → 403 «registration is closed», если env
  `VESMARO_ALLOW_REGISTRATION != "1"`;
- `VESMARO_ALLOW_REGISTRATION=1` → открыта, создаёт `member`.

Флаг деплоя — паттерн «как у password-provisioner»: читается env в момент
запроса, дефолт fail-closed (закрыто).

## 4. Сессии

```
auth_sessions:
  token_hash  TEXT PK     -- sha256(token); токен = secrets.token_urlsafe(32)
  account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
  created_at  TEXT NOT NULL
  expires_at  TEXT NOT NULL  -- last activity + 6h (скользящий)
  ua, ip      TEXT NOT NULL DEFAULT ''
```

- Cookie: `vesmaro_auth=<token>` — HttpOnly, SameSite=Strict, Path=/,
  Secure по схеме запроса, Max-Age=21600 (скользящий idle-TTL 6ч — та же
  ратифицированная владельцем поправка, что у `vesmaro_ui`; активность
  продлевает, 6ч тишины = разлогин). Прецедент параметров — ADR 0014 Ф2.
- Токен сессии: 192 бита энтропии; в БД только sha256-дайджест (прецедент
  device_sessions; plaintext живёт один раз — в Set-Cookie).
- Сессия серверная (в отличие от stateless `vesmaro_ui`): logout удаляет
  строку → украденный cookie умирает мгновенно (revocation), ротация не
  нужна. Просроченные строки подчищаются лениво при создании новой
  сессии.
- Скользящее продление: механизм тот же, что у `vesmaro_ui` — guard
  помечает request.state, route-обёртка после УСПЕШНОГО ответа тратит
  бюджет (не чаще раза в 5 мин на сессию, LRU-таблица ≤256) и
  переиздаёт cookie с новым Max-Age + обновляет `expires_at` в БД тем же
  тактом (cookie Max-Age и серверный срок всегда согласованы).
  Session-fixation невозможен: новый токен минтится на каждом login.
- CSRF: SameSite=Strict — основной барьер (позиция АРХКОМ в ADR 0014, не
  пересматривается): state-changing роуты только POST/DELETE, CORS не
  открывается. Явная проверка Origin — отложена тем же триггером
  (браузеры, игнорирующие SameSite / multi-origin сценарий).

### 4.1 Роль сессии vs ui-токена

| Нога | Кто | Где живёт | Статус |
| --- | --- | --- | --- |
| `Authorization: Bearer <ui-токен>` | машины: CI, провижининг, поллер | секрет деплоя | без изменений |
| `Authorization: Bearer <board-токен>` | машины (machine-класс) | секрет деплоя | без изменений |
| cookie `vesmaro_ui` | вставленный руками ui-токен в браузере (legacy paste-вход) | stateless = токен | без изменений, уходит из владельческого пути после FE-среза |
| cookie `vesmaro_auth` | человек после логина | серверная строка + HttpOnly cookie | НОВОЕ |

Сессия = тот же класс допуска, что ui-токен: открывает ui-мутации и
ui-гейтнутые чтения (Кора, факты сессий, телеметрия, owner-only списки),
НИКОГДА не открывает machine-роуты и не даёт устройству (`mnd_`) ничего
сверх его скоупа — cookie не читается device-scope middleware (она
классифицирует только `Bearer mnd_`), а guard'ы машины от cookie не
зависят. Determinism-правило ADR 0014 сохранено байт-в-байт: заголовок
присутствует → только header-нога (cookie не фолбэк); заголовка нет →
cookie-нога.

Интеграция точечно: `_guard_write`/`_guard_ui_write` (cookie-нога),
leg-pick reports, чтения task-session-facts / Kora-список / Kora-транскрипт
/ телеметрия-инжест, `_leg_is_authenticated` (атрибуция видна). Boot-probe
`GET /api/auth/ui-token` НЕ тронут (контракт гидрации FE запинен) — статус
парольной сессии отвечает новый `GET /api/auth/me`.

### 4.2 Миграция существующих сессий

Не требуется — всё аддитивно: открытые вкладки с `vesmaro_ui` и header-ноги
машин продолжают работать; владелец может поставить пароль, когда FE-срез
положит форму; до тех пор вход по токену остаётся рабочим. Отката нет:
куки не переименовываются, env не вводятся (кроме опционального
`VESMARO_ALLOW_REGISTRATION`).

### 4.3 Fail-closed

Парольная сессия ездит внутри ui-класса: когда ни один токен-класс не
сконфигурирован, guard'ы отвечают 503 как раньше (аккаунты не обходят
fail-closed борда; compose/чарт всегда дают токены машинам). Login/register
от конфигурации токенов не зависят.

## 5. Контракт (аддитивный, /api/auth/*)

| Метод/путь | Вход | Исходы |
| --- | --- | --- |
| `POST /api/auth/register` | `{username 3..32 [a-z0-9_-], password 8..512}` | 201 `{username, role}` + cookie; 403 registration closed; 409 username taken; 429; 422 |
| `POST /api/auth/login` | `{username, password}` | 200 `{ok, username, role}` + cookie; 401 нейтральный «invalid username or password» (без перечисления имён); 429 |
| `POST /api/auth/logout` | — | 204 + Max-Age=0, строка сессии удалена; без guard (та же логика, что DELETE /api/auth/ui-token: logout, который 401-ит на истёкшей cookie, — ловушка) |
| `GET /api/auth/me` | — | 200 `{authenticated, username?, role?}`; read-only oracle: без reissue и без продления |

Лимитеры (плоские, per real client IP, паттерн `_pairing_ip_limiter`):

| Поверхность | per-IP | global |
| --- | --- | --- |
| login | 10/60s | 60/60s (= verify ui-токена) |
| register | 3/600s | 30/600s |

Экспоненциальный lockout по-прежнему отклонён (ADR 0014: за traefik вся
LAN за одним NAT-IP — экспонента = DoS владельца одной залипшей вкладкой);
стоимость попытки честно поднята scrypt-работой. Триггер возврата к
вопросу — тот же: метрики атак или выход за single-owner LAN.

Пароли/токены/хэши: ноль значений в логах и ответах (только имена
полей/событий; username логируется как не-секрет).

## 6. OWASP-чеклист новой authn-поверхности (A07:2021 + ASVS 2.x)

| # | Пункт | Статус |
| --- | --- | --- |
| 1 | Пароли не хранятся в открытом виде / не reverseable; memory-hard KDF, соль на пароль | DONE — scrypt N=2^15 r=8 p=1, соль 16Б (§3.1; argon2id — задокументированный upgrade seam) |
| 2 | Сравнение пароля — не по plaintext в БД; битый хэш → False, не 500 | DONE |
| 3 | Timing-равновесие login (существует имя / нет) | DONE — dummy-scrypt прогон, одинаковый 401 detail |
| 4 | Rate limit на login/register; анти-enumeration | DONE — плоские лимитеры §5; нейтральный 401 |
| 5 | Account lockout экспоненциальный | DEFERRED — осознанно (NAT-LAN DoS, ADR 0014; триггер возврата записан) |
| 6 | Cookie flags: HttpOnly, SameSite=Strict, Secure по схеме, Path=/, Max-Age | DONE — тесты пинят каждый флаг |
| 7 | CSRF для cookie-сессий | DONE (базово) — SameSite=Strict, POST/DELETE-only, без CORS; Origin-check DEFERRED (триггер как в ADR 0014) |
| 8 | Session token энтропия ≥128 бит; в БД только хэш | DONE — 192 бита, sha256, прецедент device_sessions |
| 9 | Session fixation | DONE — новый токен на каждый login |
| 10 | Server-side revocation/logout | DONE — DELETE строки; cookie Max-Age=0; logout без guard по дизайну |
| 11 | Idle timeout | DONE — скользящий 6ч (ратифицированная поправка владельца), cookie+БД согласованы тактом reissue |
| 12 | Password policy | DONE — NIST 800-63B: 8..512, без составных правил |
| 13 | Секреты в логах | DONE — ноль значений; mask_secrets прецедент продолжается (пароль не логируется нигде, тест caplog) |
| 14 | Username normalization/enumeration | DONE — lowercase boundary-нормализация; UNIQUE; нейтральный 401 |
| 15 | Регистрация fail-closed | DONE — открыта только пока accounts пуст; дальше флаг деплоя |
| 16 | Не ослабить существующее | DONE — ui-token/`vesmaro_ui`/machine-ноги байт-в-байт; probe не тронут; 503 fail-closed сохранён |

## 7. Тесты (tests/test_auth_accounts.py)

Happy path + failure + boundary по каждой поверхности: register (первый
=owner, второй 403, флаг → member, 409 дубль в любом регистре, 422
границы), login (200+cookie, 401 нейтральный ×2 исхода, 429 per-IP и
global), logout (204, ревокация — replay 401), me (аноним/живая сессия,
без reissue), guard-интеграция (cookie-нога ui-мутация 201; machine-роут
401; header-present игнорирует cookie; reports leg-pick; чтения Коры/
фактов/телеметрии; mnd_+cookie закрытый роут 403), sliding reissue
(переиздаётся, троттлится), хэши (формат, неверный пароль, неизвестный
алгоритм, уникальные соли), CSRF-флаги, пароль не в логах.
scrypt-параметры в тестах занижены monkeypatch'ем (скорость контура).

## 8. Попутный фикс (в этом срезе)

Подсказка входа (`login.hintCommand`, ru+en) ссылалась на секрет
`vesma-eyes-ui-token` — верное каноничное имя по RUNBOOK §8/чарту:
`vesmaro-eyes-ui-token`. Исправлен один токен в i18n (hint + toastLegacy)
и два пина в LoginDialog.flow.test.tsx. Страницы docs-секции
(deploy.md/tokens.md/token-rotation.md/troubleshooting.md/faq.md в
viewer/src/features/docs/content) повторяют ту же опечатку — идут
отдельным FE/docs-срезом (вне /auth, tech-writer/FE территория); в
отчёте поименованы.

## 9. Что НЕ в этом срезе

FE-формы вкладок «Вход|Регистрация» (И2, готовый API ждёт); переработка
пейринга/устройств; argon2id-миграция (seam готов, решение за АРХКОМ);
Origin-check; «запомнить меня»; multi-user права member.

## 10. Гейты

pytest ≥ 1520 passed + новые кейсы (базлайн 1520/4); vitest ≥ 224
файлов / 1917 тестов (базлайн этого среза; директивный минимум 223/1898
перекрыт); OpenAPI аддитивно, снапшот-регенерация отдельным коммитом;
push `feat/me080-accounts` от origin/main 474617c (≥ 9225a1c —
выполнено); мерж запрещён до каскад-ревью security-аудитора.
