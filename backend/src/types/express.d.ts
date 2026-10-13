declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth` from the verified session JWT. */
      userId?: string;
    }
  }
}

export {};
