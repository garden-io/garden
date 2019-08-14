# Contexts

This directory contains the React Contexts (and accompanying hooks) that are used by the Dashboard.

The Contexts use hooks to create actions and manage state. The actions and state are attached to a Provider via the `value` prop. The Providers are then added to the component tree, usually at the top.

This way, components down the tree can access the state and the actions that the Context-Provider pair manages.

### api.tsx

Here we define the global data store which is a normalized version of the data types used in the `garden-service` backend.

We use a `useReduce` kind of hook to create a store and a dispatch function. We also have a specific hook for creating the actions that call the API.

These actions call a dedicated handler which checks if the data requested exists in the store and fetches it if needed. These handlers are also responsible for normalizing the data to fit the store shape.

Here, we also initialize the websocket connection. Data received via websocket events is also merged into to the global store object if applicable, so that we can automatically re-render any affected components.

Finally, the actions and the store are added to the API Provider so that they are accessible throughout the component tree.

### ui.tsx

The UI Context manages the global UI state. It should only contain UI state that truly needs to be global. All other UI state can be managed at the component level.

### api-handlers.tsx

The handler functions are responsible for checking whether data exists in the store, fetching it if doesn't, and normalizing the response so that it can be easily merged into the store.
