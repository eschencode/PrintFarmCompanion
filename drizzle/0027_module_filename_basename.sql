-- Strip any absolute/Pi paths previously stored in print_modules.filename down to
-- the bare basename. filename is now the source of truth; the local copy path is
-- derived (<appdata>/modules/<id>_<filename>). See docs/local-file-flow.md.
--
-- SQLite basename idiom: rtrim(str, replace(str,'/','')) returns everything up to
-- and including the last '/', i.e. the dirname; replacing that with '' leaves the
-- basename.
UPDATE print_modules
SET filename = replace(filename, rtrim(filename, replace(filename, '/', '')), '')
WHERE filename LIKE '%/%';
