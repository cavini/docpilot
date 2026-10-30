'use client';

import { useDispatch, useSelector, useStore } from 'react-redux';

import { type AppDispatch, type AppStore, type RootState } from './store';

/** `useDispatch` that knows the store's thunk middleware. */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();

/** `useSelector` typed against the application state. */
export const useAppSelector = useSelector.withTypes<RootState>();

/** `useStore` typed against the application store. */
export const useAppStore = useStore.withTypes<AppStore>();
