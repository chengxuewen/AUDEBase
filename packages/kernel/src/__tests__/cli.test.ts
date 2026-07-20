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

  test('extra arguments are ignored for "start"', () => {
    // Arrange
    const args = ["/usr/bin/node", "/path/to/cli.ts", "start", "--port", "4000"];

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result.command).toBe("start");
  });

  test('"tenant list" is recognized', () => {
    // Arrange
    const args = argv("tenant", "list");

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result).toEqual<ParsedArgs>({ command: "tenant", subcommand: "list" });
  });

  test('"tenant create my-org" captures tenant name', () => {
    // Arrange
    const args = argv("tenant", "create", "my-org");

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result).toEqual<ParsedArgs>({
      command: "tenant",
      subcommand: "create",
      tenantName: "my-org",
    });
  });

  test('"tenant" without subcommand is recognized', () => {
    // Arrange
    const args = argv("tenant");

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result).toEqual<ParsedArgs>({ command: "tenant" });
  });

  // ── Plugin commands ────────────────────────────────────────

  test('"doctor" is recognized', () => {
    // Arrange
    const args = argv("doctor");

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result).toEqual<ParsedArgs>({ command: "doctor" });
  });

  test('"plugin list" is recognized', () => {
    // Arrange
    const args = argv("plugin", "list");

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result).toEqual<ParsedArgs>({ command: "plugin", subcommand: "list" });
  });

  test('"plugin info my-plugin" captures name', () => {
    // Arrange
    const args = argv("plugin", "info", "my-plugin");

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result).toEqual<ParsedArgs>({
      command: "plugin",
      subcommand: "info",
      pluginName: "my-plugin",
    });
  });

  test('"plugin enable my-plugin" captures name', () => {
    // Arrange
    const args = argv("plugin", "enable", "my-plugin");

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result).toEqual<ParsedArgs>({
      command: "plugin",
      subcommand: "enable",
      pluginName: "my-plugin",
    });
  });

  test('"plugin disable my-plugin" captures name', () => {
    // Arrange
    const args = argv("plugin", "disable", "my-plugin");

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result).toEqual<ParsedArgs>({
      command: "plugin",
      subcommand: "disable",
      pluginName: "my-plugin",
    });
  });

  test('"plugin scaffold my-plugin" with defaults', () => {
    // Arrange
    const args = argv("plugin", "scaffold", "my-plugin");

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result).toEqual<ParsedArgs>({
      command: "plugin",
      subcommand: "scaffold",
      pluginName: "my-plugin",
      pluginOptions: {},
    });
  });

  test('"plugin scaffold my-plugin --partition erp --with-models" captures options', () => {
    // Arrange
    const args = argv("plugin", "scaffold", "my-plugin", "--partition", "erp", "--with-models");

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result).toEqual<ParsedArgs>({
      command: "plugin",
      subcommand: "scaffold",
      pluginName: "my-plugin",
      pluginOptions: { partition: "erp", withModels: true },
    });
  });

  test('"plugin scaffold test --mode process --partition mes" captures options', () => {
    // Arrange
    const args = argv("plugin", "scaffold", "test", "--mode", "process", "--partition", "mes");

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result).toEqual<ParsedArgs>({
      command: "plugin",
      subcommand: "scaffold",
      pluginName: "test",
      pluginOptions: { mode: "process", partition: "mes" },
    });
  });

  test('"plugin" without subcommand is recognized', () => {
    // Arrange
    const args = argv("plugin");

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result).toEqual<ParsedArgs>({ command: "plugin" });
  });

  test('"plugin upgrade my-plugin" captures name', () => {
    // Arrange
    const args = argv("plugin", "upgrade", "my-plugin");

    // Act
    const result = parseArgs(args);

    // Assert
    expect(result).toEqual<ParsedArgs>({
      command: "plugin",
      subcommand: "upgrade",
      pluginName: "my-plugin",
    });
});

});