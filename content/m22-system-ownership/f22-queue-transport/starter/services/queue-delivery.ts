import type { Delivery, DeliveryDependencies } from './queue-contract';
export async function openDelivery(deps: DeliveryDependencies): Promise<Delivery> {
  // TODO: own real transport resources from startup through final acknowledgement.
  throw Error('TODO: queue transport');
}
