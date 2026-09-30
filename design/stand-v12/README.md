# Стенд «ВАУ v12» (ME-061, experiment/wow-v12)

Скаффолд машинерии под ВАУ-редизайн v12. Арт-наполнение (hero-композиции)
придёт из `design/docs/15-WOW-DIRECTION.md` — волна 2; машинерия при смене
наполнения не правится.

## Запуск

```bash
cd design/stand-v12
python3 -m http.server 8126
# вход: http://localhost:8126/wow.html (index.html редиректит сюда)
```

## Структура

| Путь | Роль |
|---|---|
| `wow.html` | Трейлер: один экран, за 5 секунд показывает, что продукт живой. Композиция — placeholder фронтенда до арт-дирекшна; на загрузке играется авто-дуга `task.start → write → task.done → owner.wait → owner.clear` (отключается `?static=1`) |
| `index.html` | Редирект на `wow.html` |
| `shell.html` | Полигон машинерии: полный шелл + демо-хуки шины + лента событий + слот героя |
| `hosts.html` | Заглушка: живой слой v11 ссылается сюда из карточки ошибки связи (08 §5.3) |
| `styles/tokens-v12.css` | Токены: палитра — база `design/stand/styles/tokens.css` (+ v11 `--duration-attention*`); НОВАЯ типографика — два регистра: «КИНО» (clamp до 9.5rem, `--tracking-hero` −0.035em) и «ПРИБОРКА» (микрошкала v11) |
| `styles/shell-v12.css` | Новый шелл-каркас: топбар/сайдбар/ткань, кнопки, демо-панель |
| `styles/living-layer.css` | Продуктовые стили живого слоя — перенос из `stand-v11-base/styles/shell.css` (блок «v10 Живой слой», строки 1059–1265) без правок |
| `styles/wow.css` | Композиция трейлера (placeholder) |
| `js/living.js` | Живой слой v11 — дословная копия `stand-v11-base/js/living.js` (байт-в-байт) |
| `js/stand-v12.js` | Машинерия: тема, режимы живого слоя, демо-хуки шины, лента, авто-дуга трейлера |
| `fonts/` | Локальные woff2-сабсеты из `stand-v11-base/fonts` (Inter, JetBrains Mono, Lora) |
| `screens/` | Каталог под экраны волны 2 (пуст) |

## Что взято из stand-v11-base как есть

- `js/living.js` — самодостаточен, шина `stand:feed-event`, словарь v2
  (`task.start/done`, `owner.wait/clear`, `error`, `write/recall/index`).
- Стили живого слоя (`.living-neura`, `.living-vein`, `.living-courier`,
  `.living-v3-card`) — извлечены из `shell.css` v11 без изменений.
- Структурные хуки каркаса сохранены: `.topbar` (жила Ж1), `.topbar-status`
  + `.pill.live` (слот Нейры), `.sidebar` (Ж2), `.side-domain .side-label`
  «Память/Задачи/Агенты» (узлы-источники курьеров), `[data-exec-count]`
  (свечение внимания).

## Демо-хуки

`shell.html#living`: кнопки `task.start / task.done / owner.wait /
owner.clear / error` публикуют события в `document`-событие
`stand:feed-event` (единственный источник, 08 §3.1). «error» бьёт дважды
(300ms) — карточка В3 открывается после двух подряд. Лента
`#feed-log` (`role=log`) показывает каждое событие шины.

Режимы слоя: `vesmaro.livingLayer = full|calm|off` (localStorage) +
`?living=…` (вкладочно, оверрайд living.js). Тема:
`vesmaro.theme = dark|light`.

## Протокол интеграции арт-дирекшна (волна 2)

1. Дизайнер приносит `design/docs/15-WOW-DIRECTION.md`.
2. Hero-композиции встают в слоты: `shell.html` `<!-- HERO:v12 slot-1 -->`,
   `wow.html` `<!-- HERO:PLACEHOLDER -->`; новые экраны — в `screens/`
   на каркасе `shell.html` (копировать разметку шелла целиком).
3. Типографика героев — только регистр «КИНО» токенов
   (`--text-hero-xl/hero/display`, `--tracking-hero`, `--leading-hero`);
   литералы в компонентах запрещены.
4. Живой слой и шина не правятся: наполнение публикует события в
   `stand:feed-event` — слой отыграет сам.
