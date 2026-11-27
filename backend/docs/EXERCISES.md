# Exercises: change it yourself

Do these **without help** (no AI, no internet; the docs, `docs/HOW-IT-WORKS.md` and your own code are allowed). That is the exam situation.
For each: change the code, run it, and check it the way the exercise says. If you are stuck for more than 15 minutes, write down what
you tried and ask me to **show** you (then redo it alone the next day).

## Feature 2: Properties

### 1. Add a field
Give a property an optional **`Notes`** text (at most 500 characters), for example "Gate code is on the fridge".
- Touch: the entity, the database rules, the request DTO (with a length limit), the response DTO, the service mapping (create, update and `ToResponse`), and a **new migration**.
- You know it works when: `properties/create` with `notes` returns it, `properties/update` can change it, the `Properties` table has a `Notes` column that allows NULL, and a 501-character note gets a 400.
- Think about: which of these files would you NOT need to touch if the field were only read, never sent by the client?

### 2. Add a role check
Guards must **not see the street address** of a property (they only need the name and the coordinates). An admin sees everything as before.
- Touch: the place that turns a `Property` into a `PropertyResponse`, and the places that call it (the service knows the caller's role).
- You know it works when: the same property shows `address` to its admin and an empty `address` to an assigned guard, on `list` and on `get`.
- Think about: why do it in the service and not in the controller? What would break if you only hid it in the app?

### 3. Add a filter
Add an optional **`search`** to `properties/list`: only properties whose name contains the text (not case sensitive).
- Touch: the controller function (a new optional parameter), the service method (one more `Where`).
- You know it works when: `properties/list?search=ho` finds "Home" and "house", `properties/list` without it still returns everything, and in the log of the backend you see **one** SQL query that filters by the name (EF Core writes it as `LIKE` or `CHARINDEX`): the filtering happens in SQL Server, not in memory.
- Think about: what happens if the search text is empty or only spaces?
