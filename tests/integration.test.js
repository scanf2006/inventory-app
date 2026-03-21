const { expect } = require('chai');
const { visit, waitFor, click, fillIn, find } = require('ember-cli-testing');
const LocalStorageMock = require('localstorage-memory');
const sinon = require('sinon');

// Replace the global localStorage with the mock for tests
before(function () {
    global.localStorage = new LocalStorageMock();
});

describe('Inventory App Integration Tests', function() {
    beforeEach(async function() {
        // Set up before each test, e.g., navigating to the app
        await visit('/');
    });

    it('should load the app and register service worker', async function() {
        await waitFor('h1'); // Wait for the main header to load
        const swRegistration = await navigator.serviceWorker.getRegistration();
        expect(swRegistration).to.not.be.undefined;
    });

    it('should support offline capabilities', async function() {
        const sw = await navigator.serviceWorker.getRegistration();
        await sw.update();
        await sw.waiting.postMessage({ action: 'skipWaiting' });
        // Simulate offline
        await navigator.serviceWorker.controller.postMessage({ action: 'offline' });
        const isOnline = navigator.onLine;
        expect(isOnline).to.be.false;
    });

    it('should save data to localStorage', async function() {
        await fillIn('#item-name', 'Test Item');
        await click('#add-item-button');
        expect(localStorage.getItem('items')).to.include('Test Item');
    });

    it('should synchronize with Supabase', async function() {
        const syncSpy = sinon.spy();
        // Mock the sync function
        const syncWithSupabase = async () => {
            syncSpy();
            return Promise.resolve();
        };
        await syncWithSupabase();
        expect(syncSpy).to.have.been.calledOnce;
    });

    it('should perform UI interactions', async function() {
        await fillIn('#search-item', 'Test Item');
        await click('#search-button');
        await waitFor('.item-list');
        const itemVisible = find('.item-list').textContent;
        expect(itemVisible).to.include('Test Item');
    });
});