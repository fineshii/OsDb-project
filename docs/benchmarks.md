# DBMS Keyword Search Benchmarking: LIKE vs FULLTEXT vs Inverted Index

## Measured run

This table records a real run of the project benchmark endpoint against 100 indexed text files. The database was an isolated, otherwise empty MySQL schema so unrelated files could not affect the timings or result counts.

- **Measured:** 2026-11-06
- **Runtime:** Node.js v22.14.0
- **Database:** MySQL 8.0.43, InnoDB, `utf8mb4`
- **Dataset:** 100 distinct files, 1,024 bytes each (102,400 bytes total)
- **Indexing:** 100 index jobs completed by two worker processes before measurement
- **Repetitions:** 10 requests per query; each request ran LIKE, FULLTEXT, and inverted-index searches once
- **Reported time:** median of the endpoint's per-mode `timeMs` values; result mapping is included
- **Raw observations:** [benchmark-raw-2026-11-06.json](./benchmark-raw-2026-11-06.json)

| Query term         | Matching files | LIKE median (ms) | FULLTEXT median (ms) | Inverted index median (ms) | Counts (LIKE / FULLTEXT / index) |
| ------------------ | -------------: | ---------------: | -------------------: | -------------------------: | -------------------------------: |
| `benchdistributed` |            100 |             1.07 |                 1.20 |                       1.17 |                  100 / 100 / 100 |
| `benchalgorithm`   |             70 |             1.18 |                 1.42 |                       1.01 |                     70 / 70 / 70 |
| `benchscheduling`  |             40 |             1.21 |                 1.14 |                       0.86 |                     40 / 40 / 40 |
| `benchpreemptive`  |             12 |             1.63 |                 0.97 |                       0.83 |                     12 / 12 / 12 |

## How the dataset was constructed

Each document included the `benchdistributed` token. Documents 1–70 also included `benchalgorithm`, documents 1–40 included `benchscheduling`, and documents 1–12 included `benchpreemptive`. Other terms padded each document to 1,024 ASCII bytes. Unique query prefixes kept matching counts specific to this dataset.

## Search strategy notes

### SQL `LIKE` baseline

`WHERE content LIKE '%term%'` supports substring matching. A leading wildcard generally prevents a normal B-tree index from narrowing the search, so MySQL may inspect many content rows.

### MySQL `FULLTEXT`

`MATCH(content) AGAINST (? IN NATURAL LANGUAGE MODE)` uses MySQL's full-text index and scoring. Tokenization and stop-word behavior can differ from the other two modes, so result counts should always be checked.

### Application inverted index

`index_terms` and `postings` store tokens and term frequencies produced by index jobs. Search uses indexed relational lookups. Results depend on completed indexing jobs and the tokenizer's rules.

## Interpretation

This is one local run on a small dataset. The custom index was fastest for three terms, while FULLTEXT was fastest for `benchpreemptive`; these measurements do not establish a universal winner or predict performance at larger scale. Re-run with different corpus sizes and distributions before making broader performance claims.
