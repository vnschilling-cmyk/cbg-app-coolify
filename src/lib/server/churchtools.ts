/**
 * ChurchTools API integration utility.
 * Documentation: https://api.church.tools/
 */

export interface CTAbsence {
    id: string;
    personId: string;
    startDate: string;
    endDate: string;
    reason?: string;
}

export class ChurchToolsClient {
    private baseUrl: string;
    private apiToken: string;

    constructor(baseUrl: string, apiToken: string) {
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        this.apiToken = apiToken;
    }

    public async request(endpoint: string, options: RequestInit = {}) {
        const url = `${this.baseUrl}/api/${endpoint}`;
        const headers = {
            'Authorization': `Login ${this.apiToken}`,
            'Content-Type': 'application/json',
            ...options.headers,
        };

        const response = await fetch(url, { ...options, headers });
        if (!response.ok) {
            const body = await response.text();
            console.error(`Status: ${response.status}, Body: ${body.substring(0, 500)}`);
            throw new Error(`ChurchTools API error: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return response.json();
        } else {
            const text = await response.text();
            console.error('Non-JSON response:', text.substring(0, 500));
            throw new Error('ChurchTools API returned non-JSON response');
        }
    }

    /** Alle Termin-Kalender (Kalender-Auswahl). */
    async getCalendars(): Promise<any[]> {
        const data = await this.request('calendars');
        return data.data || [];
    }

    /** Termine (appointments) für mehrere Kalender in einem Zeitraum. */
    async getAppointments(ids: (string | number)[], from: string, to: string): Promise<any[]> {
        if (!ids.length) return [];
        const q = ids.map((id) => `calendar_ids[]=${id}`).join('&');
        const data = await this.request(`calendars/appointments?${q}&from=${from}&to=${to}`);
        return data.data || [];
    }

    /**
     * Fetch absences. If groupId is provided, fetches absences for that specific group.
     */
    async getAbsences(from: string, to: string, groupId?: string): Promise<CTAbsence[]> {
        const endpoint = groupId
            ? `groups/${groupId}/absences?from=${from}&to=${to}&limit=100`
            : `persons/absences?from=${from}&to=${to}&limit=100`;

        const data = await this.request(endpoint);
        return data.data || [];
    }

    /**
     * Fetch services (assignments) for events in a specific time range.
     */
    async getEventsWithServices(from: string, to: string): Promise<any[]> {
        const data = await this.request(`events?from=${from}&to=${to}&limit=100&include=eventServices`);
        return data.data || [];
    }

    /**
     * Fetch persons within a specific group.
     */
    async getGroupMembers(groupId: string): Promise<any[]> {
        const data = await this.request(`groups/${groupId}/members?limit=100`);
        // Typically ChurchTools returns an array of member objects which contain person details
        return data.data || [];
    }

    /**
     * Personen-Volltextsuche. `/persons` kennt KEINEN `query`-Parameter
     * (er würde ignoriert → einfach die ersten Treffer liefern); die echte
     * Suche läuft über die globale `/search` mit domain_types[]=person.
     * Liefert die rohen Treffer (data[]) mit title/domainIdentifier/imageUrl.
     */
    async searchPersons(query: string, limit = 25): Promise<any[]> {
        const q = encodeURIComponent(query);
        const data = await this.request(
            `search?query=${q}&domain_types[]=person&limit=${limit}`,
        );
        return data.data || [];
    }

    /**
     * Fetch all available services.
     */
    async getServices(): Promise<any[]> {
        const data = await this.request('services');
        return data.data || [];
    }

    /**
     * Fetch bookings (assignments) for a specific event.
     */
    async getEventBookings(eventId: string | number): Promise<any[]> {
        const data = await this.request(`events/${eventId}/bookings`);
        return data.data || [];
    }

    /**
     * Create or update a service assignment (booking).
     * Status IDs: 1 = requested, 2 = confirmed, 3 = rejected
     */
    async setAssignment(eventId: string | number, serviceId: string | number, personId: string | number, statusId: number = 2) {
        return await this.request(`events/${eventId}/bookings`, {
            method: 'POST',
            body: JSON.stringify({
                personId,
                serviceId,
                statusId
            })
        });
    }

    /**
     * Delete a service assignment.
     */
    async deleteAssignment(eventId: string | number, bookingId: string | number) {
        return await this.request(`events/${eventId}/bookings/${bookingId}`, {
            method: 'DELETE'
        });
    }

    /**
     * Sync data to Pocketbase (conceptual logic)
     */
    async syncToPocketbase() {
        console.log('Syncing ChurchTools data to Pocketbase...');
    }
}
