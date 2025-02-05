import ClientInstanceService from '../../../lib/services/client-metrics/instance-service';
import { IClientApp } from '../../../lib/types/model';
import { secondsToMilliseconds } from 'date-fns';
import { createTestConfig } from '../../config/test-config';
import { IUnleashConfig, IUnleashStores } from '../../../lib/types';
import { FakePrivateProjectChecker } from '../../../lib/features/private-project/fakePrivateProjectChecker';
import { ITestDb } from '../helpers/database-init';

const faker = require('faker');
const dbInit = require('../helpers/database-init');
const getLogger = require('../../fixtures/no-logger');
const { APPLICATION_CREATED } = require('../../../lib/types/events');

let stores: IUnleashStores;
let db: ITestDb;
let clientInstanceService: ClientInstanceService;
let config: IUnleashConfig;
beforeAll(async () => {
    db = await dbInit('client_metrics_service_serial', getLogger);
    stores = db.stores;
    config = createTestConfig({});
    const bulkInterval = secondsToMilliseconds(0.5);
    const announcementInterval = secondsToMilliseconds(2);

    clientInstanceService = new ClientInstanceService(
        stores,
        config,
        new FakePrivateProjectChecker(),
    );
});

afterAll(async () => {
    await db.destroy();
});
test('Apps registered should be announced', async () => {
    expect.assertions(3);
    const clientRegistration: IClientApp = {
        appName: faker.internet.domainName(),
        instanceId: faker.datatype.uuid(),
        strategies: ['default'],
        started: Date.now(),
        interval: faker.datatype.number(),
        icon: '',
        description: faker.company.catchPhrase(),
        color: faker.internet.color(),
    };
    const differentClient = {
        appName: faker.datatype.uuid(),
        instanceId: faker.datatype.uuid(),
        strategies: ['default'],
        started: Date.now(),
        interval: faker.datatype.number(),
        icon: '',
        description: faker.company.catchPhrase(),
        color: faker.internet.color(),
    };
    await clientInstanceService.registerClient(clientRegistration, '127.0.0.1');
    await clientInstanceService.registerClient(differentClient, '127.0.0.1');
    await clientInstanceService.bulkAdd(); // in prod called by a SchedulerService
    const first = await stores.clientApplicationsStore.getUnannounced();
    expect(first.length).toBe(2);
    await clientInstanceService.registerClient(clientRegistration, '127.0.0.1');
    await clientInstanceService.announceUnannounced(); // in prod called by a SchedulerService
    const second = await stores.clientApplicationsStore.getUnannounced();
    expect(second.length).toBe(0);
    const events = await stores.eventStore.getEvents();
    const appCreatedEvents = events.filter(
        (e) => e.type === APPLICATION_CREATED,
    );
    expect(appCreatedEvents.length).toBe(2);
});
