# crawler

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

## API Token Authentication

All API endpoints are protected by a simple API token check. To use the API:

1. Set your API token in the `.env` file:

   ```
   API_TOKEN=your-secure-api-token
   ```

2. Include the token in your API requests using one of these methods:

   - HTTP header: `Authorization: Bearer your-secure-api-token`
   - Query parameter (for GET requests): `?token=your-secure-api-token`

3. The web interface will require the API token for starting new crawls.

This project was created using `bun init` in bun v1.2.0. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
