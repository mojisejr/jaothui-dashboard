/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { createClient } from "@sanity/client";
import { env } from "~/env";

export const sanityClient = createClient({
  projectId: env.SANITY_PROJECT_ID,
  dataset: env.SANITY_DATASET,
  useCdn: false, // We want fresh data for exports
  apiVersion: "2023-05-03",
  token: env.SANITY_API_TOKEN,
});

export interface EventRegisterData {
  ownerName: string;
  ownerTel: string;
  microchip: string;
  name: string;
  color: string;
  sex: string;
  buffaloAge: number;
  type: string;
  level: string;
  birthday: string;
  event: {
    title: string;
  };
}

export interface SanityEvent {
  _id: string;
  title: string;
  _type: string;
}

export const getEventsFromSanity = async (): Promise<SanityEvent[]> => {
  const events = await sanityClient.fetch(
    `*[_type == "event"]{
      _id,
      title,
      _type
    } | order(title asc)`
  );
  return events;
};

export const getEventDataFromSanity = async (eventId: string): Promise<EventRegisterData[]> => {
  const data = await sanityClient.fetch(
    `*[_type == "eventRegister" && event._ref == "${eventId}"]{
      ownerName,
      ownerTel,
      microchip,
      name,
      color,
      sex,
      buffaloAge, 
      type,
      level,
      birthday,
      "event": event->{title}
    }`
  );
  return data;
};
