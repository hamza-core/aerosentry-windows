# Contributing

## Git
- **One feature = one branch** `feature/<name>`, opened as a pull request. Features that build on each other are **stacked** (each PR targets the previous branch) and merged bottom first, with **"Create a merge commit"** (not squash) and "delete branch".
- **Small commits** in Conventional Commit style: `feat(cameras): ...`, `fix(alerts): ...`, `refactor(api): ...`, `docs: ...`, `style: ...`.
- Never commit secrets. Secrets live in `AeroSentry.Api/appsettings.Local.json` (git-ignored); the example file is committed. Check before you push: `git log -G"<a secret>" --oneline` must print nothing.
- Update `CHANGELOG.md` and `docs/API.md` (and `docs/HOW-IT-WORKS.md` / `docs/DATABASE.md` when tables change) in the same PR as the feature.

## Adding a feature or an endpoint: the recipe
Every feature is the same five pieces. Copy an existing one (Cameras is the simplest) and rename.
1. **Entity** in `Data/Entities/` and a `DbSet` plus rules (lengths, unique indexes, delete behaviour) in `Data/AppDbContext.cs`. Think about what happens when the parent is deleted (Cascade or Restrict, and SQL Server allows only one cascade path to a table).
2. **Migration:** `dotnet ef migrations add Name`, read the generated file, then `dotnet ef database update`.
3. **DTOs** in `DTOs/`: a request with validation attributes, a response. Never return an entity.
4. **Service + interface:** the service in `Services/`, its interface in `Services/Interfaces/` (one interface per file; exceptions and small data types go in their own file next to the service, not in the interface file; the interface's namespace is `AeroSentry.Api.Services.Interfaces`, like its folder, so add `using AeroSentry.Api.Services.Interfaces;` where it is used). The service holds all the logic, using `AppDbContext` directly (no repository layer). Return `Result<T>`. Use `PropertyAccess` for "who may see this property". Return `NotFound` for "not yours" (never 403).
5. **Controller** in `Controllers/`: inherit `ApiControllerBase`, route `api/v1/<feature>`, one function per action named `<verb>-<thing>` (`create`, `list`, `get`, `update`, `delete`, `save-cells`...), ids in the query string, `[Authorize(Roles = "Admin")]` on writes. No logic. Then add `AddScoped<IThing, Thing>()` in `Program.cs`.

Rules of the road: services never return entities; every ML or camera conversation goes through one client class; best-effort extras (push, face recognition) must never fail the main action; anything "only one" is backed by a unique index, not only by a check.

## Before you open a PR
- `dotnet build` shows 0 warnings and 0 errors; the migration applies to a database.
- You ran the new functions (Scalar or Postman) including the error cases (400, 401, 403, 404, 409).
- No new package without a reason: the system must run offline (list it in `docs/OFFLINE-CHECKLIST.md`).
