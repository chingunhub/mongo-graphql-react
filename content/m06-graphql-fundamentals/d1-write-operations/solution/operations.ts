// Write each operation as a GraphQL string. The /* GraphQL */ comment just helps editors highlight it.

export const MISSIONS_BY_STATUS = /* GraphQL */ `
  query MissionsByStatus($status: MissionStatus!) {
    missions(status: $status) {
      name
      launchYear
    }
  }
`;

export const MISSION_DETAIL = /* GraphQL */ `
  query MissionDetail($id: ID!) {
    mission(id: $id) {
      name
      status
      rocket {
        name
        reusable
      }
      crew {
        name
        role
      }
    }
  }
`;

export const COMPARE_MISSIONS = /* GraphQL */ `
  query CompareMissions($a: ID!, $b: ID!) {
    first: mission(id: $a) {
      name
      launchYear
    }
    second: mission(id: $b) {
      name
      launchYear
    }
  }
`;

export const MISSION_CREW = /* GraphQL */ `
  query MissionCrew($id: ID!) {
    mission(id: $id) {
      name
      commander {
        ...CrewMember
      }
      crew {
        ...CrewMember
      }
    }
  }

  fragment CrewMember on Astronaut {
    name
    role
    nationality
  }
`;

export const ADD_ASTRONAUT = /* GraphQL */ `
  mutation AddAstronaut($input: AddAstronautInput!) {
    addAstronaut(input: $input) {
      id
      name
      role
    }
  }
`;
