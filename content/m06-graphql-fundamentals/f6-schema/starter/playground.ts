import { makeExecutableSchema } from '@graphql-tools/schema';
import { printSchema } from 'graphql';
import { typeDefs } from './server/graphql/schema';

// Builds the schema from your files (no resolvers yet) and prints it.
// A typo or an unknown type will throw here with a helpful message.
const schema = makeExecutableSchema({ typeDefs });
console.log(printSchema(schema));
