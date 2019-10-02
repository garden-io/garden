# Contexts

This directory contains the React Contexts (and accompanying hooks) that are used by the Dashboard.

The Contexts use hooks to manage state. The state and dispatch function are attached to a Provider via the `value` prop. The Providers are then added to the component tree, usually at the top.

This way, components down the tree can access the state and the dispatch function that the Context-Provider pair manages.

### api.tsx

Here we define the global data store which is a normalized version of the data types used in the `garden-service` backend.

We use a `useReduce` kind of hook to create a store and a dispatch function. The dispatch function gets passed to the API action functions in `api/actions.tsx`. The actions fetch the data and are also responsible for merging it correctly into the global store.

Here, we also initialize the websocket connection. Data received via websocket events is also merged into to the global store object if applicable, so that we can automatically re-render any affected components.

Finally, the dispatch and the store are added to the API Provider so that they are accessible throughout the component tree.

### ui.tsx

The UI Context manages the global UI state. It should only contain UI state that truly needs to be global. All other UI state can be managed at the component level.
