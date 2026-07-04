const SYSTEM_REMINDER_RE = /<system-reminder\b[^>]*>[\s\S]*?<\/system-reminder>\s*/g;

/** Remove system-reminder spans from user-visible text. First-class rule:
 * reminders are model-facing context, never rendered. */
export function stripSystemReminders(text: string): string {
  return text.replace(SYSTEM_REMINDER_RE, "").trimEnd();
}
