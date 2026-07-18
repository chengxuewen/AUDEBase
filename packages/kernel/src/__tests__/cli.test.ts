import { describe, test, expect } from "vitest";
import { parseArgs, type ParsedArgs } from "../cli";

// ── Helpers ──────────────────────────────────────────────────

function argv(firstCmd: string, ...rest: string[]): readonly string[] {
  return ["/usr/bin/node", "/path/to/cli.ts", firstCmd, ...rest];
}

describe("parseArgs", () => {
  test('"start" command is recognized', () => {
    // Arrange
    const args = argv("start");

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result).toEqual<ParsedArgs>({ command: "start" });
  });

  test('"db:migrate" command is recognized', () => {
    // Arrange
    const args = argv("db:migrate");

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result).toEqual<ParsedArgs>({ command: "db:migrate" });
  });

  test('"--help" is recognized', () => {
    // Arrange
    const args = argv("--help");

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result).toEqual<ParsedArgs>({ command: "help" });
  });

  test('"-h" is recognized', () => {
    // Arrange
    const args = argv("-h");

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result).toEqual<ParsedArgs>({ command: "help" });
  });

  test("unknown command returns unknown with the command name", () => {
    // Arrange
    const args = argv("bogus");

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result).toEqual<ParsedArgs>({ command: "unknown", unknownName: "bogus" });
  });

  test("no command returns unknown with undefined name", () => {
    // Arrange
    const args: readonly string[] = ["/usr/bin/node", "/path/to/cli.ts"];

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result).toEqual<ParsedArgs>({ command: "unknown", unknownName: undefined });
  });

  test("extra arguments are ignored", () => {
    // Arrange
    const args = ["/usr/bin/node", "/path/to/cli.ts", "start", "--port", "4000"];

    // Act
    const result = parseArgs(args);

    // Assert
    // Extra args are ignored — only first positional matters
    expect(result.command).toBe("start");
  });
});
