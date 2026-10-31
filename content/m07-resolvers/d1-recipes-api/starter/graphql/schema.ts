export const typeDefs = /* GraphQL */ `
  type Ingredient {
    name: String!
    quantity: String!
  }

  type Recipe {
    id: ID!
    title: String!
    minutes: Int!
    tags: [String!]!
    ingredients: [Ingredient!]!
    ingredientCount: Int!
    "ISO-8601"
    createdAt: String!
  }

  input IngredientInput {
    name: String!
    quantity: String!
  }

  input AddRecipeInput {
    title: String!
    minutes: Int!
    tags: [String!]
    ingredients: [IngredientInput!]
  }

  type Query {
    recipes(tag: String, maxMinutes: Int): [Recipe!]!
    recipe(id: ID!): Recipe
  }

  type Mutation {
    addRecipe(input: AddRecipeInput!): Recipe!
    addIngredient(recipeId: ID!, ingredient: IngredientInput!): Recipe!
    deleteRecipe(id: ID!): Boolean!
  }
`;
