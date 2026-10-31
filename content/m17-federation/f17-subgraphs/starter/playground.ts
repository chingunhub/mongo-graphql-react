import { printSubgraphSchema } from '@apollo/subgraph';
import { contactSubgraph, ticketSubgraph } from './services/subgraphs';
console.log(printSubgraphSchema(contactSubgraph()));
console.log(printSubgraphSchema(ticketSubgraph()));
