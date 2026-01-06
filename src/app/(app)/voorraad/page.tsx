'use server';

import { initializeFirebase } from '@/firebase';
import { getInventoryMovements, getProducts } from '@/lib/store';
import { VoorraadClientPage } from './client-page';
import { InventoryMovement } from '@/lib/types';

export default async function VoorraadPage() {
    const { firestore } = initializeFirebase();
    
    const [movements, allProducts] = await Promise.all([
        getInventoryMovements(firestore),
        getProducts(firestore)
    ]);
    
    // Set of all products that have ever had a movement
    const productsInStock = new Set(movements.map(m => m.productName));

    const stock = Array.from(productsInStock).map(productName => {
        const productMovements = movements.filter(m => m.productName === productName);
        const currentStock = productMovements.reduce((sum, m) => sum + m.quantity, 0);
        const unit = productMovements.find(m => m.unit)?.unit || 'onbekend';
        
        return {
            productName,
            stock: currentStock,
            unit,
        };
    }).sort((a, b) => a.productName.localeCompare(b.productName));

    return <VoorraadClientPage 
        initialStock={stock}
        allProducts={allProducts}
    />;
}
