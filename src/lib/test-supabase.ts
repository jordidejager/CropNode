
import { getAllCtgbProducts } from './supabase-store';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
    console.log('Testing Supabase connection...');
    try {
        const { getAllCtgbProducts, getSpuitschriftEntries, getInventoryMovements } = await import('./supabase-store');

        // Note: getAllCtgbProducts in store now has .limit(1000)
        const products = await getAllCtgbProducts();
        console.log(`Ctgb Products found: ${products.length}`);

        if (products.length > 0) {
            const hardFruit = products.filter(p =>
                p.gebruiksvoorschriften?.some(g =>
                    ['appel', 'peer', 'pitvruchten'].some(c => g.gewas?.toLowerCase().includes(c))
                )
            );
            console.log(`Products matching hard fruit filter: ${hardFruit.length}`);
            if (products.length > 0 && products.length < 5) console.log(JSON.stringify(products[0], null, 2));
        }

        const entries = await getSpuitschriftEntries();
        console.log(`Spuitschrift entries found: ${entries.length}`);

        const inventory = await getInventoryMovements();
        console.log(`Inventory movements found: ${inventory.length}`);

    } catch (error) {
        console.error('Error:', error);
    }
}

main();
