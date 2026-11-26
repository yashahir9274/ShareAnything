/** What the server sends in a Web Push message. Never contains message text. */
export type PushPayload = {
  title: string;
  body: string;
  /** Notifications with the same tag replace each other (but still alert). */
  tag: string;
  /** Opened when the notification is clicked. */
  url: string;
  /** Push-service collapse key: an undelivered message is replaced by a newer one. */
  topic: string;
};
