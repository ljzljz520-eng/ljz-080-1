export type Role = 'customer' | 'sales' | 'legal' | 'warehouse';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  company: string | null;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    requireRole: (...roles: Role[]) => import('fastify').preHandlerHookHandler;
    logEvent: (p: {
      client?: import('pg').PoolClient;
      applicationId: string;
      eventType: string;
      fromStatus?: string | null;
      toStatus?: string | null;
      actor: AuthUser;
      detail?: string | null;
    }) => Promise<void>;
  }
}
