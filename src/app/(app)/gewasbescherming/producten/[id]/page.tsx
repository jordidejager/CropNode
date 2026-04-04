'use client';

import { useParams } from 'next/navigation';
import { redirect } from 'next/navigation';
import { useEffect } from 'react';

// Redirect old product URLs to new database route
export default function ProductRedirect() {
    const params = useParams();
    const id = params.id as string;

    useEffect(() => {
        window.location.replace(`/gewasbescherming/database/${id}`);
    }, [id]);

    return null;
}
