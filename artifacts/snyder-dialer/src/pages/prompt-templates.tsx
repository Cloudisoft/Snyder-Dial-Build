import { useState } from 'react';
import {
  useListPromptTemplates,
  useCreatePromptTemplate,
  useUpdatePromptTemplate,
  useDeletePromptTemplate,
  getListPromptTemplatesQueryKey,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Edit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import type { PromptTemplate } from '@workspace/api-client-react';

export default function PromptTemplates() {
  const { data: templates, isLoading } = useListPromptTemplates();
  const createTemplate = useCreatePromptTemplate();
  const updateTemplate = useUpdatePromptTemplate();
  const deleteTemplate = useDeletePromptTemplate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');

  const openDialog = (template?: PromptTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setName(template.name);
      setContent(template.content);
    } else {
      setEditingTemplate(null);
      setName('');
      setContent('');
    }
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const variables = content.match(/\{\{(\w+)\}\}/g)?.map((v) => v.slice(2, -2)) || [];

    if (editingTemplate) {
      updateTemplate.mutate(
        { id: editingTemplate.id, data: { name, content, variables } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPromptTemplatesQueryKey() });
            setOpen(false);
            toast({ title: 'Template updated' });
          },
          onError: (error) => {
            toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
          },
        }
      );
    } else {
      createTemplate.mutate(
        { data: { name, content, variables } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPromptTemplatesQueryKey() });
            setOpen(false);
            toast({ title: 'Template created' });
          },
          onError: (error) => {
            toast({ title: 'Creation failed', description: error.message, variant: 'destructive' });
          },
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm('Delete this template?')) return;

    deleteTemplate.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPromptTemplatesQueryKey() });
          toast({ title: 'Template deleted' });
        },
      }
    );
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Prompt Templates</h1>
          <p className="text-muted-foreground">Reusable AI prompt templates for your campaigns</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => openDialog()} data-testid="button-new-template">
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? 'Edit Template' : 'Create Template'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <Label htmlFor="name">Template Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="mt-1.5"
                  data-testid="input-template-name"
                />
              </div>
              <div>
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  className="mt-1.5 min-h-64 font-mono text-sm"
                  placeholder="Use {{variable}} for dynamic content..."
                  data-testid="textarea-template-content"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Use double curly braces for variables: {'{{'} name {'}}'}, {'{{'} company {'}}'}, etc.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createTemplate.isPending || updateTemplate.isPending}
                  data-testid="button-submit-template"
                >
                  {editingTemplate ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-card border border-card-border rounded-lg h-64 animate-pulse" />
            ))}
          </>
        ) : templates && templates.length > 0 ? (
          templates.map((template) => (
            <div
              key={template.id}
              className="bg-card border border-card-border rounded-lg p-6"
              data-testid={`template-${template.id}`}
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold">{template.name}</h3>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openDialog(template)}
                    data-testid={`button-edit-${template.id}`}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(template.id)}
                    data-testid={`button-delete-${template.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="bg-muted/50 rounded p-4 font-mono text-sm max-h-48 overflow-auto">
                {template.content}
              </div>
              {template.variables && template.variables.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {template.variables.map((variable) => (
                    <span
                      key={variable}
                      className="px-2 py-1 bg-primary/10 text-primary text-xs rounded font-mono"
                    >
                      {'{{'} {variable} {'}}'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="col-span-2 bg-card border border-card-border rounded-lg p-12 text-center">
            <p className="text-muted-foreground mb-4">No templates yet</p>
            <Button onClick={() => openDialog()} data-testid="button-create-first-template">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Template
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
