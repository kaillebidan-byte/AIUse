# AIUse result envelope v1

Minimal common outer shape for normalized AIUse outputs.

This is intentionally **not** a universal content schema. Existing source-specific fields stay inside `content`.
Migrate existing tools only when they are touched for another reason.

## Shape

```json
{
  "schema_version": 1,
  "source": {
    "type": "x|reddit|futaba|video|audio|image|web|file",
    "url": "https://...",
    "path": "C:\\..."
  },
  "retrieved_at": "2026-08-26T12:34:56+00:00",
  "author": null,
  "published_at": null,
  "text": null,
  "media": [],
  "comments": [],
  "content": {},
  "provenance": {
    "tool": "tool-name",
    "acquisition_path": "native|reader|browser|local-file|...",
    "upstream_tools": []
  }
}
```

## Stable fields

- `schema_version`: integer. Current value is `1`.
- `source`: object describing the original input.
  - `type`: broad source/media type.
  - `url`: original URL when one exists, otherwise `null`.
  - `path`: original local path when one exists, otherwise `null`.
- `retrieved_at`: UTC ISO-8601 timestamp for this result.
- `author`: optional common author object/string when there is one clear author. Otherwise `null`.
- `published_at`: optional source publication timestamp. Otherwise `null`.
- `text`: optional primary plain text useful to downstream analysis. For a video this may be transcript text.
- `media`: common list of media/artifact references. Items may include `role`, `type`, `url`, `path`, dimensions, timestamps, or other small media metadata.
- `comments`: common list for comment/reply style sources. Empty when not applicable.
- `content`: source-specific normalized payload. Do not force unlike sources into one shape.
- `provenance`: how this result was produced.
  - `tool`: AIUse tool producing the envelope.
  - `acquisition_path`: actual acquisition route.
  - `upstream_tools`: helpers reused by the producing tool.

## Policy

The envelope exists to make routing, caching, and downstream handling easier without rewriting every reader.

Do:

- keep existing rich/source-specific data under `content`;
- put the most useful common text/media references in `text` / `media`;
- record the actual acquisition path;
- add fields only after repeated real workflows need them.

Do not:

- redesign X, Reddit, Futaba, and video data into one giant schema;
- break an existing tool only to migrate it to v1;
- duplicate large binary data inside JSON;
- treat `schema_version: 1` as a public compatibility promise beyond AIUse.

## First consumer

`tools/media-inspector/` is the first v1 producer.

Existing `x-post-resolver`, `reddit-thread-reader`, and `futaba-thread-reader` keep their current JSON for now. When one is next modified for a real task, it can add an envelope output mode or a thin adapter then.
