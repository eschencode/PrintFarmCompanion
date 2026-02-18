/**
 * Shopify API Client
 * 
 * Handles authentication and requests to the Shopify Admin API.
 * Uses the Admin API access token for authentication.
 */

export interface ShopifyLineItem {
    id: number;
    name: string;
    sku: string | null;
    quantity: number;
    price: string;
    product_id: number;
    variant_id: number;
}

export interface ShopifyOrder {
    id: number;
    order_number: number;
    name: string; // e.g., "#1001"
    created_at: string;
    updated_at: string;
    financial_status: string; // 'paid', 'pending', 'refunded', etc.
    fulfillment_status: string | null; // 'fulfilled', 'partial', null
    line_items: ShopifyLineItem[];
    cancelled_at: string | null;
}

interface ShopifyOrdersResponse {
    orders: ShopifyOrder[];
}

export class ShopifyClient {
    private storeDomain: string;
    private accessToken: string;
    private apiVersion = '2024-01';

    constructor(storeDomain: string, accessToken: string) {
        // Ensure domain is in correct format
        this.storeDomain = storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
        if (!this.storeDomain.includes('.myshopify.com')) {
            this.storeDomain = `${this.storeDomain}.myshopify.com`;
        }
        this.accessToken = accessToken;
    }

    /**
     * Make an authenticated request to the Shopify Admin API
     */
    private async fetch<T>(endpoint: string): Promise<T> {
        const url = `https://${this.storeDomain}/admin/api/${this.apiVersion}${endpoint}`;
        
        const response = await fetch(url, {
            headers: {
                'X-Shopify-Access-Token': this.accessToken,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Shopify API error ${response.status}: ${errorBody}`);
        }

        return response.json() as Promise<T>;
    }

    /**
     * Fetch orders created after a specific order ID
     * Returns orders in ascending order (oldest first)
     * 
     * @param sinceId - Only fetch orders after this ID
     * @param limit - Max orders per request (max 250)
     * @param fetchAll - If true, fetches ALL orders using pagination (for initial sync)
     */
    async getOrdersSince(
        sinceId?: string | number | null, 
        limit = 50,
        fetchAll = false
    ): Promise<ShopifyOrder[]> {
        // Shopify max is 250 per request
        const perPage = Math.min(limit, 250);
        
        if (!fetchAll) {
            // Single request
            return this.fetchOrdersPage(sinceId, perPage);
        }
        
        // Fetch all orders using pagination
        const allOrders: ShopifyOrder[] = [];
        let currentSinceId = sinceId;
        let hasMore = true;
        
        while (hasMore) {
            const orders = await this.fetchOrdersPage(currentSinceId, 250);
            
            if (orders.length === 0) {
                hasMore = false;
            } else {
                allOrders.push(...orders);
                // Get the last order's ID for pagination
                currentSinceId = String(orders[orders.length - 1].id);
                
                // If we got less than 250, we've reached the end
                if (orders.length < 250) {
                    hasMore = false;
                }
                
                // Safety limit to prevent infinite loops
                if (allOrders.length > 10000) {
                    console.warn('Shopify sync: Hit safety limit of 10000 orders');
                    hasMore = false;
                }
            }
        }
        
        return allOrders;
    }

    /**
     * Fetch a single page of orders
     */
    private async fetchOrdersPage(sinceId?: string | number | null, limit = 250): Promise<ShopifyOrder[]> {
        const params = new URLSearchParams({
            status: 'any',
            limit: String(limit),
            fields: 'id,order_number,name,created_at,updated_at,financial_status,fulfillment_status,line_items,cancelled_at',
        });

        if (sinceId) {
            // Ensure since_id is a clean integer string (no quotes, no decimals)
            const cleanId = String(sinceId).replace(/[^0-9]/g, '');
            if (cleanId) {
                params.set('since_id', cleanId);
            }
        }

        const response = await this.fetch<ShopifyOrdersResponse>(`/orders.json?${params}`);
        return response.orders;
    }

    /**
     * Test the connection to Shopify
     */
    async testConnection(): Promise<{ success: boolean; shopName?: string; error?: string }> {
        try {
            const response = await this.fetch<{ shop: { name: string } }>('/shop.json');
            return { success: true, shopName: response.shop.name };
        } catch (err) {
            return { success: false, error: String(err) };
        }
    }
}
