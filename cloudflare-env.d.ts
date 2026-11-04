declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    IVR_ACCESS_TEAM_DOMAIN?: string;
    IVR_ACCESS_AUD?: string;
    ADMIN_EMAIL?: string;
    ADMIN_TOKEN?: string;
  }
}
