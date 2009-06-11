package Recs::Operation::chain;

use strict;
use warnings;

use base qw(Recs::Operation Recs::ScreenPrinter);

use Data::Dumper;

sub init {
   my $this = shift;
   my $args = shift;

   $DB::single=1;
   my ($show_chain, $dry_run);
   my $spec = {
      'show-chain' => \$show_chain,
      'n'          => sub { $show_chain = 1; $dry_run = 1; },
   };

   my @chain_args;
   while ( @$args && (! is_recs_command($args->[0]) ) ) {
      push @chain_args, shift(@$args);
   }

   $this->parse_options(\@chain_args, $spec);
   return unless (@$args);
   
   $this->{'SAVED_ARGS'} = [@$args] if ( $show_chain );

   if ( $dry_run ) {
      $this->{'DRY_RUN'} = $dry_run;
      return;
   }

   my $operations = $this->create_operations($args);

   my ($first_operation, $last_operation) = $this->setup_operations($operations);

   $this->{'CHAIN_HEAD'} = $first_operation;
   $this->{'CHAIN_TAIL'} = $last_operation;
  
}

sub print_chain {
   my $this = shift;
   my $args = shift;

   my @current_command;
   my $was_shell = 0;

   $this->print_value("Chain Starts with:\n");

   my $indent = 1;
   my $last;
   foreach my $arg ( @$args ) {
      if ( $arg eq '|' ) {
         $was_shell = $this->print_command(\@current_command, $last, \$indent);

         $last = [@current_command];
         @current_command = ();
         next;
      }
      push @current_command, $arg;
   }

   $this->print_command(\@current_command, $last, \$indent);
}

sub print_command {
   my $this            = shift;
   my $current_command = shift;
   my $last            = shift;
   my $indent          = shift;

   my $message = '';
   if ( defined $last ) {
      if ( is_recs_command($last->[0]) && is_recs_command($current_command->[0]) ) {
         $message .= "Passed in memory to ";
      }
      else {
         $message .= "Passed through a pipe to ";
         $$indent++;
      }
   }

   $this->print_value('  ' x $$indent . $message);

   if ( is_recs_command($current_command->[0]) ) {
      $this->print_value("Recs command: " . join(' ', @$current_command) . "\n");
      return 0;
   }
   else {
      $this->print_value("Shell command: " . join(' ', @$current_command) . "\n");
      return 1;
   }
}

sub is_recs_command {
   my $command = shift;
   return $command =~ m/^recs-/;
}

sub setup_operations {
   my $this       = shift;
   my $operations = shift;

   my ($first_operation, $last_operation);
   while ( my $operation = shift @$operations ) {
      if ( UNIVERSAL::isa($operation, 'ARRAY') ) {
         my $in_continuation = $this->setup_fork($operation);

         if ( $in_continuation ) {
            $first_operation = undef;
            $last_operation  = undef;
            next;
         }
         else {
            last;
         }
      }

      $first_operation ||= $operation;
      $last_operation  ||= $operation;

      $last_operation->_set_next_operation($operation) unless ( $last_operation == $operation );
      $last_operation = $operation;
   }

   return ($first_operation, $last_operation);
}

sub create_operations {
   my $this = shift;
   my $args = shift;

   my @single_command;
   my @operations;
   foreach my $arg ( @$args ) {
      if ( $arg eq '|' ) {
         $this->add_operation(\@single_command, \@operations);
         @single_command = ();
         next;
      }

      push @single_command, $arg;
   }

   $this->add_operation(\@single_command, \@operations);

   return \@operations;
}

sub add_operation {
   my $this           = shift;
   my $single_command = shift;
   my $operations     = shift;

   if ( is_recs_command($single_command->[0]) ) {
      push @$operations, Recs::Operation->create_operation(@$single_command);
   } 
   else {
      push @$operations, [@$single_command];
   }
}

sub setup_fork {
   my $this              = shift;
   my $command_arguments = shift;

   my $pid = open(STDOUT, "|-");
   die "cannot fork: $!" unless defined $pid;

   if ( $pid ) { # inside parent
      return 0;
   }

   my $continuation_pid = open(STDOUT, "|-");
   die "cannot fork: $!" unless defined $continuation_pid;

   if ( $continuation_pid ) { # inside shell fork
      exec (@$command_arguments);
   }
   else { # inside chain continue
      return 1; 
   }
}

sub run_operation {
   my $this = shift;

   if ( my $args = $this->{'SAVED_ARGS'} ) {
      $this->print_chain($args);
   }

   if ( $this->{'DRY_RUN'} ) {
      return;
   }

   if ( my $head = $this->{'CHAIN_HEAD'} ) {
      $head->run_operation();
   }
   else {
      $this->print_value($_) while (<>);
   }
}

sub finish {
   my $this = shift;

   if ( my $head = $this->{'CHAIN_HEAD'} ) {
      $head->finish();
   }
}

sub get_exit_value {
   my $this = shift;
   
   if ( my $tail = $this->{'CHAIN_TAIL'} ) {
      return $tail->get_exit_value();
   }

   return 0;
}

sub usage {
   return <<USAGE;
Usage: recs-chain <command> | <command> | ...
   Creates an in-memory chain of recs operations.  This avoid serialization and
   deserialization of records at each step in a complex recs pipeline.  For
   ease of use the chain of recs commands main contain non-recs command,
   anything that does not start with a recs- is interpreted as a shell command.
   That command is forked off to the shell.  In this case, serialization and
   deserialization costs apply, but only to and from the shell command,
   everything else is done in memory.  If you have many shell commands in a
   row, there is extra over head, you should instead consider splitting those
   into separate pipes.  See the examples for more information on this.

   Arugments are specified in on the command line separated by pipes.  For most
   shells, you will need to escape the pipe character to avoid having the shell
   interpret the pipe as a shell pipe.

   --help       - Bail and print this output.
   --show-chain - Before running the commands, print out what will happen
                  in the chain
   -n           - Do not run commands, implies --show-chain

Examples:
   Parse some fields, sort and collate, all in memory
      recs-chain recs-frommultire 'data,time=(\\S+) (\\S+)' \\| recs-sort --key time=n \\| recs-collate --a perc,90,data
   Use shell commands in your recs stream
      recs-chain recs-frommultire 'data,time=(\\S+) (\\S+)' \\| recs-sort --key time=n \\| grep foo \\| recs-collate --a perc,90,data
   Many shell comamnds should be split into real pipes
      recs-chain recs-frommultire 'data,time=(\\S+) (\\S+)' \\| recs-xform '\$r->{now} = time();' \
        | grep foo | sort | uniq | recs-chain recs-collate --a perc,90,data \\| recs-totable
USAGE
}

1;
