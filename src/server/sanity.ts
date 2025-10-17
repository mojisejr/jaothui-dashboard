/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
import { createClient } from '@sanity/client';
import { env } from '~/env';

export const sanityClient = createClient({
  projectId: env.SANITY_PROJECT_ID || 'q38mtihr', // Fallback to known project ID
  dataset: env.SANITY_DATASET,
  useCdn: false, // Use CDN for production, disable for development
  apiVersion: '2024-01-01', // Use a stable API version
  token: env.SANITY_API_TOKEN, // Optional token for private datasets
});

// Type definitions for Sanity eventRegister documents
export interface EventRegister {
  _id: string;
  _type: 'eventRegister';
  eventName?: string;
  buffaloName?: string;
  microchip?: string;
  birthday?: string;
  father?: string;
  mother?: string;
  farmName?: string;
  phoneNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SanityQueryResponse<T> {
  result: T[];
  query: string;
  ms: number;
}
