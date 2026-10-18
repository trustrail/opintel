# Customer Data Segregation

Source: https://xq.stoplight.io/docs/xqmsg/4da28167c9bc4-customer-data-segregation

Retrieved: 2026-10-18T00:55:30.608085+00:00

Branch: `master` · Node type: `article` · Source URI: `/docs/DataSegregation.md`

## Published article

# Customer Data Segregation

XQ separates customer data using two key concepts: tenants and teams. Tenants operate as isolated environments that can be self-hosted by enterprises, giving them full control over their data, including keys, users, policies, and communication logs.

Within each tenant, teams function as independent units, each with its own keys, users, and policies. This layered approach enhances security by ensuring data and access are restricted to specific teams and tenants, reducing the risk of unauthorized access.

## XQ Team(s)

XQ ensures the segregation of customer data by organizing it into distinct teams, each functioning as an isolated unit with its own independently managed keys, users, policies, and communication logs. This approach enhances security and simplifies access control by limiting exposure of sensitive data to authorized individuals within a specific team.

For a user to gain access to the keys associated with a particular team, they must first authenticate and authorize themselves specifically for that team. This ensures that access is strictly controlled and aligned with the team's policies and permissions. Any attempt to access keys or data outside of a user's authorized team is automatically blocked, maintaining the integrity and confidentiality of data across all teams.

This model not only reinforces security but also facilitates compliance with data privacy regulations and internal policies. By isolating data and permissions at the team level, XQ empowers organizations to create highly secure environments tailored to their operational and compliance needs.

## XQ Team(s) Tutorial

This tutorial is divided into 3 sections, each detailing the specific API calls needed to complete that part of the tutorial. The goal is to guide you through the concept of teams in XQ and demonstrate how data segregation works between teams.

Refer to the following descriptions for an overview of each section of the tutorial:

### Section 1 - Creating Multiple Teams in XQ

In this section, you will create two teams (Team A and Team B) in XQ's backend. These teams will be used throughout the tutorial to illustrate how data is securely segregated between teams.

### Section 2 - Authorizing and Storing an Encryption Key Packet in Team A

Here, you will authorize as a user within Team A and store an encryption key packet. This key will be accessible to any member of Team A, showcasing how keys are tied to specific teams.

### Section 3 - Authorizing and Attempting Access to a Key from Team B

In this section, you will authorize as a user within Team B and attempt to access an encryption key that is restricted to Team A members. This demonstrates how access control prevents unauthorized users from retrieving keys outside their team.




