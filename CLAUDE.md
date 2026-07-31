# Claude Code Adapter

Read and follow [AGENTS.md](AGENTS.md) for all shared repository instructions.

The canonical portable skill is `.agents/skills/splunk-viz/`. Claude Code
discovers it through the thin adapter at `.claude/skills/splunk-viz/SKILL.md`.
Claude-specific permissions remain in `.claude/settings.json` and must not be
copied into the canonical skill.
