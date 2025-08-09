PPL Syllabus
https://www.aviation.govt.nz/assets/publications/pilot-syllabus-assistance-pending/Subject-No-4-PPL-Air-Law-Syllabus-effective-5-April-2025.pdf

CAA
WEB: https://www.legislation.govt.nz/act/public/2023/0010/latest/whole.html
PDF: https://www.legislation.govt.nz/act/public/2023/0010/latest/096be8ed81f4efea.pdf

## Usage

1) Prepare data

- Configure parts in `data/car.yaml` with fields:
  - `part` (int), `name` (string), `url` (string)
  - `pdf` (relative path for downloaded PDF, e.g. `download/car/Part_001_Consolidation.pdf`)
  - `md` (relative path for generated Markdown, e.g. `md/car/Part_001.md`)

2) Download CAR PDFs

```bash
npm run download:car
```
- Saves PDFs to paths defined in `pdf` for each entry
- Report: `download/car/report.json`

3) Convert PDFs to Markdown

```bash
npm run convert:car
```
- Reads PDFs from `pdf`; writes Markdown to `md`
- Report: `prompts/car/convert_report.json`

4) Combine all Markdown into one file

```bash
npm run combine:car
```
- Output: `md/car/ALL_CAR.md`
- Override output path: `OUT=./md/ALL.md npm run combine:car`

5) Ask LLM with ALL_CAR.md as system prompt

Set API key (supports `.env`):
```bash
export OPENAI_API_KEY=sk-...
```
Query:
```bash
npm run ask:car -- 'What is the objective of Part 1?'
```
Options:
- `OPENAI_MODEL=chatgpt-5-mini` (default)
- `SYSTEM_PATH=./md/car/ALL_CAR.md`
- `TRUNCATE_CHARS=200000` (optional)
- `TEMPERATURE=0.2` (default 0.2)
- `DRY_RUN=1` (no API call; prints sizes and inputs)

## Notes
- Scripts use Node.js built-ins plus minimal deps: `yaml`, `pdfjs-dist`, `openai`.
- If changing folder conventions, update `pdf`/`md` in `data/car.yaml` accordingly.
