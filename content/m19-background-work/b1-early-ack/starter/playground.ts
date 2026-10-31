import { dispatch } from './dispatch';
const steps: string[] = [];
try {
  await dispatch(
    { id: 'e1' },
    async () => {
      steps.push('delivery failed');
      throw Error('offline');
    },
    async () => {
      steps.push('acknowledged');
    },
  );
} catch (error) {
  console.log(String(error));
}
console.log(steps);
