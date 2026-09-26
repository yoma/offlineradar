import { parseHoptodateHtml } from "@/lib/source-refresh/parsers/hoptodate";
import { parseJuntasHtml } from "@/lib/source-refresh/parsers/juntas";
import { parseSpeeddatenHtml } from "@/lib/source-refresh/parsers/speeddaten";
import { parseSportieveSinglesHtml } from "@/lib/source-refresh/parsers/sportieve-singles";
import { parseTomeetoHtml } from "@/lib/source-refresh/parsers/tomeeto";
import type {
  RefreshParserKey,
  RefreshParserResult,
} from "@/lib/source-refresh/types";

export function runRefreshParser(
  parserKey: RefreshParserKey,
  html: string,
): RefreshParserResult {
  switch (parserKey) {
    case "speeddaten":
      return parseSpeeddatenHtml(html);
    case "hoptodate":
      return parseHoptodateHtml(html);
    case "sportieve-singles":
      return parseSportieveSinglesHtml(html);
    case "tomeeto":
      return parseTomeetoHtml(html);
    case "juntas":
      return parseJuntasHtml(html);
    default: {
      const _exhaustive: never = parserKey;
      return { candidates: [], warnings: [`Onbekende parser: ${_exhaustive}`] };
    }
  }
}
