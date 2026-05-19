/**
 * Shopify Order Sync Logic
 * 
 * Fetches new orders from Shopify, maps SKUs to inventory items,
 * and deducts stock accordingly.
 */

import type { D1Database } from '@cloudflare/workers-types';
import { ShopifyClient, type ShopifyOrder } from './client';
import { sql } from 'drizzle-orm';
import { getDb } from '../db';

export interface SkuMapping {
    shopify_sku: string;
    inventory_slug: string;
    quantity: number;
    source_type: 'inventory' | 'storage';
    spool_preset_id: number | null;
}

export interface SyncState {
    last_order_id: string | null;
    last_sync_at: number | null;
    orders_processed: number;
    items_deducted: number;
}

export interface SyncResult {
    success: boolean;
    ordersProcessed: number;
    itemsDeducted: number;
    skippedOrders: number;
    errors: string[];
    lastOrderId: number | null;
}

export class ShopifySyncService {
    private db: D1Database;
    private client: ShopifyClient;

    constructor(db: D1Database, client: ShopifyClient) {
        this.db = db;
        this.client = client;
    }

    /**
     * Get current sync state from database
     */
    async getSyncState(): Promise<SyncState> {
        const drizzleDb = getDb(this.db);
        const result = await drizzleDb.get<SyncState>(
            sql`SELECT last_order_id, last_sync_at, orders_processed, items_deducted FROM shopify_sync LIMIT 1`
        );

        return result || {
            last_order_id: null,
            last_sync_at: null,
            orders_processed: 0,
            items_deducted: 0
        };
    }

    /**
     * Get all SKU mappings from database
     */
    async getSkuMappings(): Promise<Map<string, SkuMapping[]>> {
        const drizzleDb = getDb(this.db);
        const rows = await drizzleDb.all<SkuMapping>(
            sql`SELECT shopify_sku, inventory_slug, quantity, source_type, spool_preset_id FROM shopify_sku_mapping`
        );

        const mappings = new Map<string, SkuMapping[]>();
        
        for (const row of rows ?? []) {
            const existing = mappings.get(row.shopify_sku) || [];
            existing.push(row);
            mappings.set(row.shopify_sku, existing);
        }

        return mappings;
    }

    /**
     * Check if an order has already been processed
     */
    async isOrderProcessed(orderId: number): Promise<boolean> {
        const drizzleDb = getDb(this.db);
        const result = await drizzleDb.get(
            sql`SELECT 1 FROM shopify_orders WHERE shopify_order_id = ${String(orderId)}`
        );

        return result !== null;
    }

    /**
     * Process a single order - deduct inventory and record
     */
    async processOrder(
        order: ShopifyOrder,
        skuMappings: Map<string, SkuMapping[]>
    ): Promise<{ itemsDeducted: number; errors: string[] }> {
        const errors: string[] = [];
        let itemsDeducted = 0;

        // Skip cancelled orders only
        if (order.cancelled_at) {
            return { itemsDeducted: 0, errors: [] };
        }

        // Process each line item
        for (const item of order.line_items) {
            if (!item.sku) {
                errors.push(`Order ${order.name}: Line item "${item.name}" has no SKU`);
                continue;
            }

            const mappings = skuMappings.get(item.sku);
            if (!mappings) {
                errors.push(`Order ${order.name}: Unknown SKU "${item.sku}"`);
                continue;
            }

            // Deduct inventory/storage for each mapping
            for (const mapping of mappings) {
                const deductAmount = mapping.quantity * item.quantity;

                try {
                    if (mapping.source_type === 'storage' && mapping.spool_preset_id) {
                        const drizzleDb = getDb(this.db);
                        // Deduct from spool preset storage count
                        await drizzleDb.run(sql`
                            UPDATE spool_presets
                            SET storage_count = MAX(0, COALESCE(storage_count, 0) - ${deductAmount})
                            WHERE id = ${mapping.spool_preset_id}
                        `);
                    } else {
                        const drizzleDb = getDb(this.db);
                        // Deduct from inventory stock
                        await drizzleDb.run(sql`
                            UPDATE inventory
                            SET stock_count = stock_count - ${deductAmount},
                                total_sold = total_sold + ${deductAmount},
                                total_sold_b2c = total_sold_b2c + ${deductAmount}
                            WHERE slug = ${mapping.inventory_slug}
                        `);

                        // Log the deduction
                        await drizzleDb.run(sql`
                            INSERT INTO inventory_log (inventory_id, change_type, quantity, reason, created_at)
                            SELECT id, 'sold_b2c', ${-deductAmount}, ${`Shopify ${order.name} - ${item.sku}`}, ${Date.now()}
                            FROM inventory WHERE slug = ${mapping.inventory_slug}
                        `);
                    }

                    itemsDeducted += deductAmount;
                } catch (err) {
                    const label = mapping.source_type === 'storage' ? `preset #${mapping.spool_preset_id}` : mapping.inventory_slug;
                    errors.push(`Order ${order.name}: Failed to deduct ${label}: ${err}`);
                }
            }
        }

        // Record the processed order
        const drizzleDb = getDb(this.db);
        await drizzleDb.run(sql`
            INSERT INTO shopify_orders (shopify_order_id, shopify_order_number, processed_at, total_items, status)
            VALUES (${String(order.id)}, ${String(order.order_number)}, ${Date.now()}, ${itemsDeducted}, 'processed')
        `);

        return { itemsDeducted, errors };
    }

    /**
     * Run a full sync - fetch new orders and process them
     * @param fetchAll - If true, fetches ALL historical orders (use for initial sync)
     */
    async sync(fetchAll = false): Promise<SyncResult> {
        const result: SyncResult = {
            success: true,
            ordersProcessed: 0,
            itemsDeducted: 0,
            skippedOrders: 0,
            errors: [],
            lastOrderId: null
        };

        try {
            // Get current state
            const syncState = await this.getSyncState();
            const skuMappings = await this.getSkuMappings();

            // Fetch orders from Shopify
            // If fetchAll is true, get ALL orders since last sync using pagination
            const orders = await this.client.getOrdersSince(
                syncState.last_order_id,
                fetchAll ? 250 : 50,
                fetchAll
            );

            if (orders.length === 0) {
                // Update sync timestamp even if no new orders
                await this.updateSyncState(syncState.last_order_id, 0, 0);
                return result;
            }

            // Process each order
            for (const order of orders) {
                // Double-check we haven't processed this order
                if (await this.isOrderProcessed(order.id)) {
                    result.skippedOrders++;
                    continue;
                }

                const orderResult = await this.processOrder(order, skuMappings);
                
                if (orderResult.itemsDeducted > 0) {
                    result.ordersProcessed++;
                    result.itemsDeducted += orderResult.itemsDeducted;
                } else if (orderResult.errors.length === 0) {
                    // Order processed but no items (maybe all cancelled)
                    result.skippedOrders++;
                }

                result.errors.push(...orderResult.errors);
                result.lastOrderId = order.id;
            }

            // Update sync state
            if (result.lastOrderId) {
                await this.updateSyncState(
                    result.lastOrderId,
                    result.ordersProcessed,
                    result.itemsDeducted
                );
            }

        } catch (err) {
            result.success = false;
            result.errors.push(`Sync failed: ${err}`);
        }

        return result;
    }

    /**
     * Update the sync state in database
     */
    private async updateSyncState(
        lastOrderId: string | number | null,
        ordersProcessed: number,
        itemsDeducted: number
    ): Promise<void> {
        // Ensure order ID is stored as clean integer string (no decimals)
        let cleanOrderId: string | null = null;
        if (lastOrderId !== null) {
            cleanOrderId = String(lastOrderId).replace(/\..*$/, '').replace(/[^0-9]/g, '');
        }
        
        const drizzleDb = getDb(this.db);
        await drizzleDb.run(sql`
            UPDATE shopify_sync 
            SET last_order_id = COALESCE(${cleanOrderId}, last_order_id),
                last_sync_at = ${Date.now()},
                orders_processed = orders_processed + ${ordersProcessed},
                items_deducted = items_deducted + ${itemsDeducted}
        `);
    }

    /**
     * Get list of recently processed orders
     */
    async getRecentOrders(limit = 20): Promise<{
        shopify_order_id: string;
        shopify_order_number: string;
        processed_at: number;
        total_items: number;
    }[]> {
        const drizzleDb = getDb(this.db);
        const rows = await drizzleDb.all<{
            shopify_order_id: string;
            shopify_order_number: string;
            processed_at: number;
            total_items: number;
        }>(sql`
            SELECT shopify_order_id, shopify_order_number, processed_at, total_items
            FROM shopify_orders
            ORDER BY processed_at DESC
            LIMIT ${limit}
        `);

        return rows ?? [];
    }
}
