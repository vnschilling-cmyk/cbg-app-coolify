/**
 * ChurchTools API integration utility.
 * Documentation: https://api.church.tools/
 */

export interface CTEvent {
    id: string;
    title: string;
    startDate: string;
    endDate: string;
    location?: string;
}

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

    /**
     * Fetch events for a specific time range.
     */
    async getEvents(from: string, to: string): Promise<CTEvent[]> {
        // Example endpoint for fetching calendar events
        // Note: Actual ChurchTools API might differ slightly based on version/setup
        const data = await this.request(`calendar/events?from=${from}&to=${to}`);
        return data.data || [];
    }

    /**
     * Fetch absences. If groupId is provided, fetches absences for that specific group.
     */
    async getAbsences(from: string, to: string, groupId?: string): Promise<CTAbsence[]> {
        const endpoint = groupId
            ? `groups/${groupId}/absences?from=${from}&to=${to}`
            : `persons/absences?from=${from}&to=${to}`;

        const data = await this.request(endpoint);
        return data.data || [];
    }

    /**
     * Fetch persons within a specific group.
     */
    async getGroupMembers(groupId: string): Promise<any[]> {
        const data = await this.request(`groups/${groupId}/members`);
        // Typically ChurchTools returns an array of member objects which contain person details
        return data.data || [];
    }

    /**
     * Sync data to Pocketbase (conceptual logic)
     */
    async syncToPocketbase() {
        console.log('Syncing ChurchTools data to Pocketbase...');
    }
}
