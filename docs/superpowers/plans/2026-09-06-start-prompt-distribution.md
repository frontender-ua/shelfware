# Стартовый промпт: дистрибутивный план (после очистки контекста)

Скопировать целиком в первое сообщение новой сессии в `~/Develop/shelfware`.

---

Проект shelfware, `~/Develop/shelfware`. Серверный и клиентский планы v0.1 выполнены и влиты в `main` (HEAD `3525404`: 214 тестов, typecheck и build чистые). Остался третий план — дистрибуция:

- спека: `docs/superpowers/specs/2026-09-05-shelfware-v0.1-design.md` (§13, §10.3, §16);
- план: `docs/superpowers/plans/2026-09-05-shelfware-v0.1-distribution.md` (3 задачи);
- референс upstream: `/Users/glua/develop/reference/skill-cabinet` — только чтение.

## Состояние, которое уже подготовлено

- Worktree `/Users/glua/Develop/shelfware/.claude/worktrees/v0.1-distribution`, ветка `v0.1-distribution` от `main` `3525404`, `pnpm install` выполнен, baseline `pnpm test` 214/214.
- SDD workspace `<worktree>/.superpowers/sdd/2026-09-05-shelfware-v0.1-distribution/`: `progress.md` (ledger с pre-flight таблицей и рулингами D1–D4), `global-constraints.md`, `task-1-brief.md`…`task-3-brief.md`. Pre-flight делать заново не нужно.
- Ни одна задача ещё не диспатчена.

## Что делать

1. Войти в worktree нативно: `EnterWorktree` с `path=/Users/glua/Develop/shelfware/.claude/worktrees/v0.1-distribution` (не создавать новый: `EnterWorktree name=…` ветвится от `origin/main`, который отстаёт).
2. Прочитать ledger `progress.md` целиком и план. Выполнить план через `superpowers:subagent-driven-development`: свежий имплементатор на задачу, task review после каждой, финальное whole-branch review, затем `superpowers:finishing-a-development-branch`. Между задачами не спрашивать меня и не писать сводки.
3. Модели: имплементаторы — задача 1 `sonnet`, задача 2 `opus`, задача 3 `sonnet`; task reviewer `opus`; scoped re-review `sonnet` (для многофайловых/security диффов `opus`); финальное review `fable`. `haiku` не использовать. Эскалация в fix-раундах 4–5 на ступень выше.
4. Применять рулинги из ledger: D1 — в задаче 2 переименовать `postinstall` → `prepare` в `package.json` и вернуть `"dependencies": {}`; D2 — `pack-verify` дополнительно проверяет содержимое tarball (`.output/server/index.mjs`, `bin/shelfware.mjs`, нет `node_modules`) и наличие тел иконок (`<path ` в `.output/public/_nuxt/*.js`) — строка `api.iconify.design` в бандле присутствует как инертная константа, её отсутствие проверять нельзя; D3 — при ошибке typecheck использовать `vi.fn<(port: number, host: string) => Promise<boolean>>()` и `fileURLToPath(import.meta.url)` вместо `__filename`; D4 — ручной запуск `node bin/shelfware.mjs` только с `HOME=$(mktemp -d)`.

## Правила для субагентов

- Факты о Nuxt 4 / Nitro брать из MCP-серверов `nuxt` и `nuxt-ui` или из спеки §16, не из памяти.
- Автотесты — единственные ворота; `pnpm pack:verify` обязан выйти с 0 до финального review.
- Один коммит на задачу, conventional commits, в теле `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Код и комментарии — на английском; со мной — по-русски.
- Фильтр vitest: `pnpm test:unit launch` (без `--`).

## Где остановиться

- Задача 3: написать `docs/placeholder-publish.md`, закоммитить, **остановиться и спросить меня**; `npm publish` никогда не запускать самостоятельно.
- Локальный merge `v0.1-distribution` в `main` после чистого финального review разрешён (fast-forward или merge-коммит, без rebase): `ExitWorktree keep` → в `~/Develop/shelfware` `git merge --ff-only v0.1-distribution` → `pnpm install --frozen-lockfile && pnpm test` → `git worktree remove .claude/worktrees/v0.1-distribution && git worktree prune && git branch -d v0.1-distribution`. Push в remote запрещён без моего отдельного «да».
- В финальном сообщении перечислить все рулинги (D1–D4 и новые) с ценой ошибки.

## После автопродолжения из-за лимита

Считать, что последний диспатч оборвался: прочитать ledger и отчёт последней задачи, затем `git status` и `git log` в worktree. Задачу без строки `complete` диспатчить заново на том же уровне модели с пометкой о возможных частичных незакоммиченных правках; задачу со строкой `complete` — никогда.
