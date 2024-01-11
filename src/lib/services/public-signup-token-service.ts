import crypto from 'crypto';
import { Logger } from '../logger';
import { IUnleashConfig, IUnleashStores, SYSTEM_USER } from '../types';
import { IPublicSignupTokenStore } from '../types/stores/public-signup-token-store';
import { PublicSignupTokenSchema } from '../openapi/spec/public-signup-token-schema';
import { IRoleStore } from '../types/stores/role-store';
import { IPublicSignupTokenCreate } from '../types/models/public-signup-token';
import { PublicSignupTokenCreateSchema } from '../openapi/spec/public-signup-token-create-schema';
import { CreateInvitedUserSchema } from '../openapi/spec/create-invited-user-schema';
import { RoleName } from '../types/model';
import {
    PublicSignupTokenCreatedEvent,
    PublicSignupTokenUpdatedEvent,
    PublicSignupTokenUserAddedEvent,
} from '../types/events';
import UserService from './user-service';
import { IUser } from '../types/user';
import { URL } from 'url';
import { add } from 'date-fns';
import EventService from './event-service';

export class PublicSignupTokenService {
    private store: IPublicSignupTokenStore;

    private roleStore: IRoleStore;

    private userService: UserService;

    private eventService: EventService;

    private logger: Logger;

    private readonly unleashBase: string;

    constructor(
        {
            publicSignupTokenStore,
            roleStore,
        }: Pick<IUnleashStores, 'publicSignupTokenStore' | 'roleStore'>,
        config: Pick<IUnleashConfig, 'getLogger' | 'authentication' | 'server'>,
        userService: UserService,
        eventService: EventService,
    ) {
        this.store = publicSignupTokenStore;
        this.userService = userService;
        this.eventService = eventService;
        this.roleStore = roleStore;
        this.logger = config.getLogger(
            '/services/public-signup-token-service.ts',
        );
        this.unleashBase = config.server.unleashUrl;
    }

    private getUrl(secret: string): string {
        return new URL(
            `${this.unleashBase}/new-user?invite=${secret}`,
        ).toString();
    }

    public async get(secret: string): Promise<PublicSignupTokenSchema> {
        return this.store.get(secret);
    }

    public async getAllTokens(): Promise<PublicSignupTokenSchema[]> {
        return this.store.getAll();
    }

    public async getAllActiveTokens(): Promise<PublicSignupTokenSchema[]> {
        return this.store.getAllActive();
    }

    public async validate(secret: string): Promise<boolean> {
        return this.store.isValid(secret);
    }

    public async update(
        secret: string,
        { expiresAt, enabled }: { expiresAt?: Date; enabled?: boolean },
        createdBy: string,
        createdByUserId: number,
    ): Promise<PublicSignupTokenSchema> {
        const result = await this.store.update(secret, { expiresAt, enabled });
        await this.eventService.storeEvent(
            new PublicSignupTokenUpdatedEvent({
                createdBy,
                createdByUserId,
                data: { secret, enabled, expiresAt },
            }),
        );
        return result;
    }

    public async addTokenUser(
        secret: string,
        createUser: CreateInvitedUserSchema,
    ): Promise<IUser> {
        const token = await this.get(secret);
        const user = await this.userService.createUser({
            ...createUser,
            rootRole: token.role.id,
        });
        await this.store.addTokenUser(secret, user.id);
        await this.eventService.storeEvent(
            new PublicSignupTokenUserAddedEvent({
                createdBy: SYSTEM_USER.username,
                createdByUserId: SYSTEM_USER.id,
                data: { secret, userId: user.id },
            }),
        );
        return user;
    }

    public async createNewPublicSignupToken(
        tokenCreate: PublicSignupTokenCreateSchema,
        createdBy: string,
        createdByUserId: number,
    ): Promise<PublicSignupTokenSchema> {
        const viewerRole = await this.roleStore.getRoleByName(RoleName.VIEWER);
        const secret = this.generateSecretKey();
        const url = this.getUrl(secret);
        const cappedDate = this.getMinimumDate(
            new Date(tokenCreate.expiresAt),
            add(new Date(), { months: 1 }),
        );
        const newToken: IPublicSignupTokenCreate = {
            name: tokenCreate.name,
            expiresAt: cappedDate,
            secret: secret,
            roleId: viewerRole ? viewerRole.id : -1,
            createdBy: createdBy,
            url: url,
        };
        const token = await this.store.insert(newToken);

        await this.eventService.storeEvent(
            new PublicSignupTokenCreatedEvent({
                createdBy: createdBy,
                createdByUserId,
                data: token,
            }),
        );
        return token;
    }

    private generateSecretKey(): string {
        return crypto.randomBytes(16).toString('hex');
    }

    private getMinimumDate(date1: Date, date2: Date): Date {
        return date1 < date2 ? date1 : date2;
    }
}
