import { expect, it } from 'vitest';
import { captureTags } from '../src/domain/tags';
it('adds the platform only when enabled and deduplicates without changing defaults',()=>{
  const settings={defaultTags:['阅读'],addPlatformTag:false};
  expect(captureTags('x',settings)).toEqual(['阅读']);
  expect(captureTags('x',{...settings,addPlatformTag:true})).toEqual(['阅读','X']);
  expect(captureTags('x',{defaultTags:['X','阅读'],addPlatformTag:true})).toEqual(['X','阅读']);
  expect(settings.defaultTags).toEqual(['阅读']);
});
it('does not exceed the server tag limit or silently drop user tags',()=>{
  const defaultTags=Array.from({length:20},(_,i)=>String(i));
  expect(()=>captureTags('x',{defaultTags,addPlatformTag:true})).toThrow('tag_limit');
  expect(captureTags('x',{defaultTags,addPlatformTag:false})).toHaveLength(20);
});
